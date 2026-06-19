// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { stripeClientOptions } from "../_shared/stripe-helpers.ts";

// Note: this endpoint is called server-to-server by Stripe. CORS headers
// not needed — never call from a browser.
const jsonHeaders = { "Content-Type": "application/json" };

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

/**
 * Update the tenant's subscription_status in the database.
 * Finds the tenant by stripe_customer_id.
 */
type UpdateResult = { ok: boolean; rowsAffected: number };

async function updateTenantStatus(
    admin: ReturnType<typeof createClient>,
    stripeCustomerId: string,
    updates: Record<string, unknown>
): Promise<UpdateResult> {
    const { error, count } = await admin
        .from("tenants")
        .update(updates, { count: "exact" })
        .eq("stripe_customer_id", stripeCustomerId);

    if (error) {
        console.error(`stripe-webhook: DB update failed for customer ${stripeCustomerId}:`, error.message);
        return { ok: false, rowsAffected: 0 };
    }
    return { ok: true, rowsAffected: count ?? 0 };
}

/**
 * Extract the total quantity from the first line item (seat-based pricing).
 *
 * Estrae la quantity (numero di seats) da una subscription Stripe.
 *
 * NOTA: questa funzione legge solo `items.data[0].quantity`.
 * CataloGlobe oggi vende un singolo prodotto (CataloGlobe Pro), quindi
 * ogni subscription ha esattamente 1 line item e questa logica è corretta.
 *
 * Se in futuro introduci addon o multi-product subscription (es. "Pro +
 * AI Import addon" come secondo line item), questa funzione va rivista per:
 *   - Identificare l'item del piano principale tramite price ID, OPPURE
 *   - Sommare le quantity di tutti gli item se la semantica è "seats totali".
 */
function getSubscriptionQuantity(subscription: Stripe.Subscription): number {
    const items = subscription.items?.data;
    if (!items || items.length === 0) return 1;
    // Defensive: the single-product model guarantees exactly 1 line item. If a
    // subscription ever carries more, items[0] silently drops the others — warn
    // so the multi-product migration (see note above) is not missed in prod.
    if (items.length > 1) {
        console.warn(
            `[stripe-webhook] subscription ${subscription.id} has ${items.length} line items; ` +
            `getSubscriptionQuantity reads only items[0].quantity.`
        );
    }
    return items[0].quantity ?? 1;
}

/**
 * Extract a validated plan_code from subscription metadata.
 * Returns null if missing or not in the allowed set — caller MUST skip the
 * `plan` update in that case to avoid poisoning the tenants row.
 */
const ALLOWED_PLAN_CODES = new Set(["base", "pro"]);
function getSubscriptionPlanCode(subscription: Stripe.Subscription): string | null {
    const code = subscription.metadata?.plan_code?.toLowerCase();
    return code && ALLOWED_PLAN_CODES.has(code) ? code : null;
}

/**
 * Reverse-lookup del plan_code dal price ID del primo line item via tabella
 * `plans` (stripe_price_id → code). Fonte di verità complementare al metadata:
 * un cambio piano via subscriptions.update / subscription schedule che NON
 * propaga metadata.plan_code viene comunque sincronizzato dal Price (source of
 * truth usata in checkout). Ritorna null se il price non mappa un piano valido.
 */
async function lookupPlanCodeByPriceId(
    admin: ReturnType<typeof createClient>,
    subscription: Stripe.Subscription
): Promise<string | null> {
    const priceId = subscription.items?.data?.[0]?.price?.id;
    if (!priceId) return null;
    const { data, error } = await admin
        .from("plans")
        .select("code")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
    if (error) {
        console.warn(`stripe-webhook: plans reverse-lookup failed for price ${priceId}:`, error.message);
        return null;
    }
    const code = data?.code?.toLowerCase();
    return code && ALLOWED_PLAN_CODES.has(code) ? code : null;
}

function toIsoTimestamp(seconds: number | null | undefined): string | null {
    return seconds ? new Date(seconds * 1000).toISOString() : null;
}

/**
 * Read `current_period_end` from the subscription. In recent Stripe API
 * versions (2024+) the top-level field has been moved to the item level;
 * we prefer the item value and fall back to the top-level for older payloads.
 */
function getSubscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): string | null {
    const itemEnd = subscription.items?.data?.[0]?.current_period_end;
    if (itemEnd) return toIsoTimestamp(itemEnd);
    return toIsoTimestamp(subscription.current_period_end);
}

/**
 * Map Stripe subscription status to our DB status values.
 * Stripe statuses: trialing, active, past_due, canceled, incomplete, incomplete_expired, unpaid, paused
 * Our statuses:    trialing, active, past_due, suspended, canceled
 */
function mapStripeStatus(stripeStatus: string): string {
    switch (stripeStatus) {
        case "trialing":
            return "trialing";
        case "active":
            return "active";
        case "past_due":
            return "past_due";
        case "canceled":
        case "incomplete_expired":
            return "canceled";
        case "incomplete":
        case "unpaid":
        case "paused":
            return "suspended";
        default:
            console.warn(`stripe-webhook: Unknown Stripe status '${stripeStatus}', mapping to 'suspended'`);
            return "suspended";
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

                // Fetch subscription to get status, quantity (paid_seats), trial_end, period_end, plan_code
                let paidSeats = 1;
                let subscriptionStatus = "trialing"; // safe default if retrieve fails
                let trialUntil: string | null = null;
                let currentPeriodEnd: string | null = null;
                let planCode: string | null = null;
                try {
                    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                    paidSeats = getSubscriptionQuantity(sub);
                    subscriptionStatus = mapStripeStatus(sub.status);
                    trialUntil = toIsoTimestamp(sub.trial_end);
                    currentPeriodEnd = getSubscriptionCurrentPeriodEnd(sub);
                    planCode = getSubscriptionPlanCode(sub);
                } catch (err) {
                    console.warn("stripe-webhook: Could not retrieve subscription on checkout:", err.message);
                }

                // Fallback to session metadata for plan_code if subscription metadata missing
                if (!planCode) {
                    const sessionPlan = session.metadata?.plan_code?.toLowerCase();
                    if (sessionPlan && ALLOWED_PLAN_CODES.has(sessionPlan)) planCode = sessionPlan;
                }

                const updates: Record<string, unknown> = {
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: stripeSubscriptionId,
                    subscription_status: subscriptionStatus,
                    paid_seats: paidSeats,
                    current_period_end: currentPeriodEnd
                };
                if (planCode) updates.plan = planCode;
                // Only write trial_until when present — never wipe an existing
                // value on a payload that simply omits trial_end.
                if (trialUntil !== null) updates.trial_until = trialUntil;

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
                    console.log(`stripe-webhook: Tenant ${tenantId} linked to subscription ${stripeSubscriptionId} (plan=${planCode ?? "unchanged"}, status=${subscriptionStatus}, seats=${paidSeats}, period_end=${currentPeriodEnd ?? "null"})`);
                }
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;
                const newStatus = mapStripeStatus(subscription.status);
                const paidSeats = getSubscriptionQuantity(subscription);
                const trialUntil = toIsoTimestamp(subscription.trial_end);
                const currentPeriodEnd = getSubscriptionCurrentPeriodEnd(subscription);
                // Priorità al metadata; se assente/non valido (es. cambio piano via
                // subscriptions.update o subscription schedule senza metadata),
                // deriva il piano dal price ID (source of truth in `plans`).
                let planCode = getSubscriptionPlanCode(subscription);
                if (!planCode) {
                    planCode = await lookupPlanCodeByPriceId(admin, subscription);
                }

                const updates: Record<string, unknown> = {
                    subscription_status: newStatus,
                    paid_seats: paidSeats,
                    current_period_end: currentPeriodEnd
                };
                if (planCode) updates.plan = planCode;
                // Only write trial_until when present — never wipe an existing
                // value on a payload that simply omits trial_end.
                if (trialUntil !== null) updates.trial_until = trialUntil;

                const result = await updateTenantStatus(admin, stripeCustomerId, updates);

                if (result.ok && result.rowsAffected > 0) {
                    console.log(`stripe-webhook: Subscription updated → status=${newStatus}, plan=${planCode ?? "unchanged"}, seats=${paidSeats}, period_end=${currentPeriodEnd ?? "null"} for customer ${stripeCustomerId} (event ${event.id})`);
                } else if (result.ok && result.rowsAffected === 0) {
                    console.warn(`stripe-webhook: NO TENANT MATCHED customer ${stripeCustomerId} for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`);
                }
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;

                const result = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: "canceled",
                    current_period_end: null
                });

                if (result.ok && result.rowsAffected > 0) {
                    console.log(`stripe-webhook: Subscription deleted for customer ${stripeCustomerId} (event ${event.id})`);
                } else if (result.ok && result.rowsAffected === 0) {
                    console.warn(`stripe-webhook: NO TENANT MATCHED customer ${stripeCustomerId} for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`);
                }
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                const stripeCustomerId = invoice.customer as string;

                const result = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: "past_due"
                });

                if (result.ok && result.rowsAffected > 0) {
                    console.log(`stripe-webhook: Payment failed → past_due for customer ${stripeCustomerId} (event ${event.id})`);
                } else if (result.ok && result.rowsAffected === 0) {
                    console.warn(`stripe-webhook: NO TENANT MATCHED customer ${stripeCustomerId} for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`);
                }
                break;
            }

            case "invoice.payment_succeeded": {
                const invoice = event.data.object as Stripe.Invoice;
                const stripeCustomerId = invoice.customer as string;

                // Only move to 'active' if currently trialing or past_due
                // (avoid overwriting 'canceled' if a final invoice pays)
                const { data: tenant } = await admin
                    .from("tenants")
                    .select("subscription_status")
                    .eq("stripe_customer_id", stripeCustomerId)
                    .maybeSingle();

                if (tenant && (tenant.subscription_status === "trialing" || tenant.subscription_status === "past_due")) {
                    const result = await updateTenantStatus(admin, stripeCustomerId, {
                        subscription_status: "active"
                    });
                    if (result.ok && result.rowsAffected > 0) {
                        console.log(`stripe-webhook: Payment succeeded → active for customer ${stripeCustomerId} (event ${event.id})`);
                    } else if (result.ok && result.rowsAffected === 0) {
                        console.warn(`stripe-webhook: NO TENANT MATCHED customer ${stripeCustomerId} for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`);
                    }
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
                    payload: event ?? null
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
