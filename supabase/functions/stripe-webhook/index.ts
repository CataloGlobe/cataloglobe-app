// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { stripeClientOptions } from "../_shared/stripe-helpers.ts";
import {
    getInvoiceSubscriptionId,
    syncSubscriptionStatus
} from "../_shared/subscriptionStatusSync.ts";
import {
    ALLOWED_PLAN_CODES,
    lookupPlanPriceByStripeId,
    type BillingInterval
} from "../_shared/planPrices.ts";
import {
    buildSubscriptionLinkUpdates,
    computePlanMonthlyValueCents,
    getSubscriptionCurrentPeriodEnd,
    getSubscriptionCurrentPeriodStart,
    getSubscriptionPlanCode,
    getSubscriptionQuantity,
    resolvePlanAndInterval,
    toIsoTimestamp
} from "../_shared/subscriptionSnapshot.ts";

// Note: this endpoint is called server-to-server by Stripe. CORS headers
// not needed — never call from a browser.
const jsonHeaders = { "Content-Type": "application/json" };

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/**
 * Reduces a raw Stripe event to a diagnostic-only snapshot for
 * webhook_errors.payload. Default-deny: only the fields explicitly listed
 * below are kept, everything else (customer email/name/address/phone/
 * tax_id, card/last4, billing_details, metadata, IP, ...) is dropped.
 * Stripe events routinely embed PII in event.data.object (invoices,
 * charges, customers, subscriptions all carry billing/contact data) — this
 * is deliberately shallow and never spreads the object.
 */
function buildSafeWebhookPayload(event: Stripe.Event | undefined): Record<string, unknown> | null {
    if (!event) return null;
    const obj = event.data?.object as { id?: string; object?: string; status?: string } | undefined;

    return {
        id: event.id ?? null,
        type: event.type ?? null,
        created: event.created ?? null,
        livemode: event.livemode ?? null,
        api_version: event.api_version ?? null,
        object: obj
            ? {
                  id: obj.id ?? null,
                  object: obj.object ?? null,
                  status: obj.status ?? null
              }
            : null,
        request_id: event.request?.idempotency_key ?? null
    };
}

/**
 * Update the tenant's subscription_status in the database.
 * Finds the tenant by stripe_customer_id.
 */
type UpdateResult = { ok: boolean; rowsAffected: number };

async function updateTenantStatus(
    admin: ReturnType<typeof createClient>,
    stripeCustomerId: string,
    updates: Record<string, unknown>,
    // Optional extra equality filter, folded into the same WHERE clause so the
    // check-and-write is one atomic statement (no separate SELECT). Used by
    // customer.subscription.deleted to require stripe_subscription_id still
    // matches the deleted subscription — otherwise a resubscribe's newer
    // checkout.session.completed write could land between a SELECT and this
    // UPDATE and get clobbered by a stale deleted event for the old subscription.
    extraEq?: readonly [column: string, value: string]
): Promise<UpdateResult> {
    let query = admin
        .from("tenants")
        .update(updates, { count: "exact" })
        .eq("stripe_customer_id", stripeCustomerId);
    if (extraEq) query = query.eq(extraEq[0], extraEq[1]);
    const { error, count } = await query;

    if (error) {
        console.error(`stripe-webhook: DB update failed for customer ${stripeCustomerId}:`, error.message);
        return { ok: false, rowsAffected: 0 };
    }
    return { ok: true, rowsAffected: count ?? 0 };
}

// `mapStripeStatus` now lives in ../_shared/subscriptionStatusSync.ts — the
// single writer for tenants.subscription_status. Nothing in this file may write
// that column from an event type; go through syncSubscriptionStatus instead.

/**
 * Intervallo di fatturazione coperto da una fattura (passo 4a): dal Price
 * della riga di PERIODO (non prorata) via plan_prices. Una fattura senza riga
 * di periodo (one-off delta sedi) non copre alcun intervallo → NULL, non il
 * fallback. Il fallback a tenants.billing_interval scatta solo se la riga di
 * periodo c'e' ma il Price non risolve (plan_prices incompleta): la cache
 * tenant puo' essere stale di un evento (customer.subscription.updated e
 * invoice.payment_succeeded non hanno ordine garantito), per questo il Price
 * della fattura ha la priorita'.
 */
async function resolveInvoiceBillingInterval(
    admin: ReturnType<typeof createClient>,
    invoice: Stripe.Invoice,
    tenantInterval: string | null | undefined
): Promise<BillingInterval | null> {
    let hasPeriodLine = false;
    for (const line of invoice.lines?.data ?? []) {
        const details = (line as { parent?: { subscription_item_details?: { proration?: boolean } } }).parent
            ?.subscription_item_details;
        if (!details || details.proration) continue;
        hasPeriodLine = true;
        const priceId = (line as { pricing?: { price_details?: { price?: string } } }).pricing?.price_details?.price;
        const match = await lookupPlanPriceByStripeId(admin, priceId);
        if (match) return match.billingInterval;
    }
    if (!hasPeriodLine) return null;
    return tenantInterval === "month" || tenantInterval === "year" ? tenantInterval : null;
}

/**
 * Registra un incasso reale in customer_invoices (archivio fiscale, righe
 * permanenti — vedi migration 20260912130000_create_customer_invoices.sql).
 *
 * Best-effort per design: un fallimento qui non deve MAI bloccare o far
 * ritornare 5xx per la sincronizzazione dello stato subscription, che ha
 * priorità. Ogni errore è loggato e la funzione ritorna senza rilanciare.
 *
 * Filtro sull'importo (amount_paid > 0), non sulla causale dell'evento: le
 * fatture a zero non arrivano solo dalle prove gratuite — esistono già
 * abbonamenti con sconto 100% che generano invoice.payment_succeeded a zero
 * su un normale rinnovo.
 *
 * Dedup: UNIQUE(stripe_invoice_id) lato DB + upsert/ignoreDuplicates qui,
 * non il completion marker di stripe_processed_events (quello deduplica per
 * event_id/consegna, non per fattura).
 */
async function recordCustomerInvoice(
    admin: ReturnType<typeof createClient>,
    invoice: Stripe.Invoice
): Promise<void> {
    try {
        if (!invoice.amount_paid || invoice.amount_paid <= 0) return;

        const stripeCustomerId = invoice.customer as string;

        const { data: tenant, error: tenantError } = await admin
            .from("tenants")
            .select(
                "id, plan, paid_seats, billing_interval, legal_entity_type, legal_name, vat_number, fiscal_code, first_name, last_name, address, street_number, postal_code, city, province, country, pec, codice_destinatario"
            )
            .eq("stripe_customer_id", stripeCustomerId)
            .maybeSingle();

        if (tenantError || !tenant) {
            console.error(
                `stripe-webhook: recordCustomerInvoice — tenant lookup failed for customer ${stripeCustomerId}, invoice ${invoice.id} NOT recorded:`,
                tenantError?.message ?? "tenant not found"
            );
            return;
        }

        const paidAt = invoice.status_transitions?.paid_at
            ? toIsoTimestamp(invoice.status_transitions.paid_at)
            : toIsoTimestamp(invoice.created);

        const billingInterval = await resolveInvoiceBillingInterval(admin, invoice, tenant.billing_interval);

        const { error: insertError } = await admin
            .from("customer_invoices")
            .upsert(
                {
                    tenant_id: tenant.id,
                    amount_cents: invoice.amount_paid,
                    currency: invoice.currency,
                    paid_at: paidAt,
                    // Nullable by design: una riga contabile si registra comunque
                    // anche se, per qualunque motivo, plan/paid_seats non fossero
                    // leggibili dalla stessa riga tenant appena letta.
                    plan_code: tenant.plan ?? null,
                    seats: tenant.paid_seats ?? null,
                    billing_interval: billingInterval,
                    legal_entity_type: tenant.legal_entity_type ?? null,
                    legal_name: tenant.legal_name ?? null,
                    vat_number: tenant.vat_number ?? null,
                    fiscal_code: tenant.fiscal_code ?? null,
                    first_name: tenant.first_name ?? null,
                    last_name: tenant.last_name ?? null,
                    address: tenant.address ?? null,
                    street_number: tenant.street_number ?? null,
                    postal_code: tenant.postal_code ?? null,
                    city: tenant.city ?? null,
                    province: tenant.province ?? null,
                    country: tenant.country ?? null,
                    pec: tenant.pec ?? null,
                    codice_destinatario: tenant.codice_destinatario ?? null,
                    stripe_invoice_id: invoice.id,
                    stripe_invoice_number: invoice.number ?? null,
                    stripe_hosted_invoice_url: invoice.hosted_invoice_url ?? null,
                    stripe_invoice_pdf: invoice.invoice_pdf ?? null,
                    stripe_subscription_id: getInvoiceSubscriptionId(invoice),
                    stripe_customer_id: stripeCustomerId
                },
                { onConflict: "stripe_invoice_id", ignoreDuplicates: true }
            );

        if (insertError) {
            console.error(`stripe-webhook: recordCustomerInvoice — insert failed for invoice ${invoice.id}:`, insertError.message);
            return;
        }

        console.log(`stripe-webhook: customer_invoices row recorded for invoice ${invoice.id} (tenant ${tenant.id}, amount ${invoice.amount_paid} ${invoice.currency})`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`stripe-webhook: recordCustomerInvoice — unexpected error for invoice ${invoice.id}:`, message);
    }
}

serve(async req => {
    // Stripe sends only POST; no OPTIONS preflight needed (server-to-server).
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    let event: Stripe.Event | undefined;

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
        const STRIPE_WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
            console.error("stripe-webhook: Missing env vars");
            return json(500, { error: "server_misconfigured" });
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, stripeClientOptions());
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // --- Verify webhook signature ---
        const signature = req.headers.get("stripe-signature");
        if (!signature) {
            console.error("stripe-webhook: Missing stripe-signature header");
            return json(400, { error: "missing_signature" });
        }

        const rawBody = await req.text();

        try {
            event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error("stripe-webhook: Signature verification failed:", err.message);
            return json(400, { error: "invalid_signature" });
        }

        console.log(`stripe-webhook: Received event ${event.type} (${event.id})`);

        // Idempotency: Stripe delivers events at-least-once. Process-once via a
        // completion marker: a row counts as "done" ONLY when completed_at is
        // set (written AFTER the handler succeeds). A row that exists but is not
        // yet completed is a prior failed attempt and MUST be re-processed.
        const { error: insertError } = await admin
            .from("stripe_processed_events")
            .insert({ event_id: event.id, event_type: event.type });

        if (insertError) {
            if (insertError.code === "23505") {
                // Row already exists from a prior delivery/attempt. Re-read its
                // completion marker to decide: completed -> truly done (200);
                // not completed -> a previous attempt failed, fall through and
                // re-process.
                const { data: existing, error: selectError } = await admin
                    .from("stripe_processed_events")
                    .select("completed_at")
                    .eq("event_id", event.id)
                    .maybeSingle();

                if (selectError) {
                    // Cannot read the marker (DB blip). Fail closed toward a
                    // retry rather than risk acking an unprocessed event: throw
                    // into the catch, which returns 5xx so Stripe retries.
                    throw selectError;
                }
                if (existing?.completed_at) {
                    console.log(`stripe-webhook: Event ${event.id} already completed, skipping.`);
                    return json(200, { received: true, idempotent: true });
                }
                console.log(`stripe-webhook: Event ${event.id} previously inserted but not completed, re-processing.`);
                // fall through to dispatch
            } else {
                // Real failure on the idempotency insert itself (DB down, etc.).
                // Log but do NOT block: process the event anyway. The completion
                // UPDATE below is best-effort; dropping the event would be worse.
                console.error(`stripe-webhook: Idempotency insert failed for event ${event.id}:`, insertError.message);
            }
        }

        // --- Handle events ---
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object as Stripe.Checkout.Session;
                const tenantId = session.metadata?.tenant_id;
                const stripeCustomerId = session.customer as string;
                const stripeSubscriptionId = session.subscription as string;

                if (!tenantId) {
                    console.error("stripe-webhook: checkout.session.completed missing tenant_id metadata");
                    break;
                }

                // Baseline for the ordering guard used by syncSubscriptionStatus:
                // the status written here comes from the live subscription we
                // just retrieved, so it is as authoritative as a synced one.
                const appliedAtIso = new Date((event.created ?? 0) * 1000).toISOString();
                const sessionPlanCode = session.metadata?.plan_code ?? null;

                // Same payload builder as stripe-checkout-confirm (the
                // return-from-payment fallback): one set of rules for linking a
                // tenant to its subscription, whichever path gets there first.
                let updates: Record<string, unknown>;
                try {
                    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                    updates = await buildSubscriptionLinkUpdates({
                        admin,
                        stripe,
                        subscription: sub,
                        stripeCustomerId,
                        appliedAtIso,
                        sessionPlanCode
                    });
                } catch (err) {
                    console.warn("stripe-webhook: Could not retrieve subscription on checkout:", err.message);
                    // Safe minimal link: the session is complete, so the
                    // subscription exists; status defaults to trialing until the
                    // next subscription event syncs the real value.
                    updates = {
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: stripeSubscriptionId,
                        subscription_status: "trialing",
                        subscription_status_event_at: appliedAtIso,
                        paid_seats: 1,
                        current_period_end: null,
                        current_period_start: null
                    };
                    const sessionPlan = sessionPlanCode?.toLowerCase();
                    if (sessionPlan && ALLOWED_PLAN_CODES.has(sessionPlan)) updates.plan = sessionPlan;
                }

                const { error, count } = await admin
                    .from("tenants")
                    .update(updates, { count: "exact" })
                    .eq("id", tenantId);

                if (error) {
                    console.error("stripe-webhook: Failed to update tenant on checkout:", error.message);
                } else if (count === null) {
                    // PostgREST did not return a row count. Cannot confirm whether
                    // the tenant row matched; treat as suspect, not as success.
                    console.warn(`stripe-webhook: UPDATE on tenant ${tenantId} returned NULL row count for event ${event.id} (${event.type}). Cannot verify match.`);
                } else if (count === 0) {
                    console.warn(`stripe-webhook: NO TENANT MATCHED id ${tenantId} for event ${event.id} (${event.type}). Possible cause: stale tenant_id metadata or tenant deleted.`);
                } else {
                    console.log(`stripe-webhook: Tenant ${tenantId} linked to subscription ${stripeSubscriptionId} (plan=${updates.plan ?? "unchanged"}, interval=${updates.billing_interval ?? "unchanged"}, status=${updates.subscription_status}, seats=${updates.paid_seats}, period_end=${updates.current_period_end ?? "null"})`);
                }
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;

                // Routed through the same helper as the invoice events: one
                // ordering guard, one source of truth. The companion fields are
                // computed from the LIVE subscription the helper retrieves, not
                // from the (possibly stale/redelivered) event payload.
                await syncSubscriptionStatus({
                    admin,
                    stripe,
                    event,
                    stripeCustomerId,
                    subscriptionId: subscription.id,
                    buildExtraUpdates: async liveSub => {
                        const paidSeats = getSubscriptionQuantity(liveSub);
                        const trialUntil = toIsoTimestamp(liveSub.trial_end);
                        const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(liveSub);
                        const currentPeriodStart = getSubscriptionCurrentPeriodStart(liveSub);
                        const planMonthlyValueCents = await computePlanMonthlyValueCents(stripe, liveSub);
                        // Piano: priorità al metadata; se assente/non valido (es. cambio
                        // piano via subscriptions.update o subscription schedule senza
                        // metadata), deriva dal Price (plan_prices). Intervallo: SOLO dal
                        // Price (plan_prices → recurring.interval), mai dai metadata.
                        const resolved = await resolvePlanAndInterval(admin, liveSub);
                        const planCode = getSubscriptionPlanCode(liveSub) ?? resolved.plan;

                        const extras: Record<string, unknown> = {
                            paid_seats: paidSeats,
                            current_period_end: currentPeriodEnd,
                            current_period_start: currentPeriodStart
                        };
                        if (planCode) extras.plan = planCode;
                        // Only write when resolved — never wipe a known interval.
                        if (resolved.interval !== null) extras.billing_interval = resolved.interval;
                        // Only write when computed — a transient Stripe API failure must
                        // never wipe a previously good contractual value.
                        if (planMonthlyValueCents !== null) extras.plan_monthly_value_cents = planMonthlyValueCents;
                        // Only write trial_until when present — never wipe an existing
                        // value on a payload that simply omits trial_end.
                        if (trialUntil !== null) extras.trial_until = trialUntil;
                        return extras;
                    }
                });
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;

                const result = await updateTenantStatus(
                    admin,
                    stripeCustomerId,
                    {
                        subscription_status: "canceled",
                        current_period_end: null,
                        // Mirror di current_period_end: nessun periodo su canceled.
                        // plan_monthly_value_cents resta com'è (tenant non eleggibile
                        // comunque; il valore storico non nuoce).
                        current_period_start: null
                    },
                    // Guard atomico: scrive solo se stripe_subscription_id è ANCORA
                    // quello cancellato. Un resubscribe (nuovo id già scritto da
                    // checkout.session.completed) fa fallire il match e l'evento
                    // stale viene ignorato invece di sovrascrivere la subscription nuova.
                    ["stripe_subscription_id", subscription.id]
                );

                if (result.ok && result.rowsAffected > 0) {
                    console.log(`stripe-webhook: Subscription deleted for customer ${stripeCustomerId} (event ${event.id})`);
                } else if (result.ok && result.rowsAffected === 0) {
                    console.log(`stripe-webhook: customer.subscription.deleted for ${subscription.id} ignored (customer ${stripeCustomerId} current subscription no longer matches, or tenant not found, for event ${event.id}). Possibile causa: resubscribe successivo, evento da ambiente diverso, o tenant eliminato.`);
                }
                break;
            }

            // Invoice events are a TRIGGER to resync, never a source of truth for
            // the status: a failed/paid invoice may be a one-off charge (seat
            // delta) that says nothing about the subscription's health. The
            // helper re-reads the live subscription and writes its real status.
            case "invoice.payment_failed":
            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;
                const stripeCustomerId = invoice.customer as string;

                await syncSubscriptionStatus({
                    admin,
                    stripe,
                    event,
                    stripeCustomerId,
                    // Invoice-bound subscription when present; the helper falls
                    // back to the tenant's own subscription for one-off invoices.
                    subscriptionId: getInvoiceSubscriptionId(invoice)
                });

                // Registrazione fiscale: solo sugli incassi riusciti, mai sui
                // falliti. Chiamata DOPO syncSubscriptionStatus — non deve mai
                // condizionarla, ed è totalmente best-effort al suo interno.
                if (event.type === "invoice.payment_succeeded") {
                    await recordCustomerInvoice(admin, invoice);
                }
                break;
            }

            default:
                console.log(`stripe-webhook: Ignoring unhandled event type ${event.type}`);
        }

        // Handler succeeded: stamp the completion marker so any redelivery is
        // acknowledged as idempotent. Best-effort — if this UPDATE fails the row
        // stays completed_at NULL and a retry re-processes (handlers are
        // idempotent UPDATEs by id, so re-processing converges).
        const { error: completeError } = await admin
            .from("stripe_processed_events")
            .update({ completed_at: new Date().toISOString() })
            .eq("event_id", event.id);
        if (completeError) {
            console.error(`stripe-webhook: Failed to mark event ${event.id} completed:`, completeError.message);
        }

        // Always return 200 to Stripe to acknowledge receipt
        return json(200, { received: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : null;
        console.error("stripe-webhook: Unhandled error:", message);

        // The event_id row was inserted into stripe_processed_events BEFORE
        // dispatch but the handler failed, so its completed_at is still NULL.
        // The completion-marker model means a retry will re-process it as-is —
        // no row removal needed. We just: (1) write the audit trail, (2) return
        // a 5xx so Stripe retries the delivery.
        const SUPABASE_URL_ERR = Deno.env.get("SUPABASE_URL");
        const SUPABASE_KEY_ERR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const errAdmin =
            SUPABASE_URL_ERR && SUPABASE_KEY_ERR
                ? createClient(SUPABASE_URL_ERR, SUPABASE_KEY_ERR)
                : null;

        // Audit trail: write to webhook_errors for post-mortem debugging.
        // Best-effort: if this INSERT fails we ignore it (already in error path).
        if (errAdmin) {
            try {
                await errAdmin.from("webhook_errors").insert({
                    source: "stripe-webhook",
                    event_id: event?.id ?? null,
                    event_type: event?.type ?? null,
                    error_message: message,
                    error_stack: stack,
                    payload: buildSafeWebhookPayload(event)
                });
            } catch (auditErr) {
                console.error("stripe-webhook: Failed to write audit trail:", auditErr);
            }
        }

        // Return 5xx so Stripe retries the delivery. Every unexpected handler
        // failure is treated as transient — retry instead of swallow. The
        // incomplete row (completed_at NULL) is what lets the retry re-process;
        // no DELETE required.
        return json(500, { received: false, error: message });
    }
});
