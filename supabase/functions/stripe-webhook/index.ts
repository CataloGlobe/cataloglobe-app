// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
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
    return items[0].quantity ?? 1;
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
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });
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

        // Idempotency check: Stripe consegna eventi at-least-once.
        // Se già processato in passato, ritorna early con 200.
        const { error: insertError } = await admin
            .from("stripe_processed_events")
            .insert({ event_id: event.id, event_type: event.type });

        if (insertError) {
            if (insertError.code === "23505") {
                // Unique constraint violation = evento già processato.
                console.log(`stripe-webhook: Event ${event.id} already processed, skipping.`);
                return json(200, { received: true, idempotent: true });
            }
            // Errore vero (DB down, ecc.). Log ma non blocchiamo: meglio processare
            // 2 volte che perdere un evento. Gli handler sono UPDATE puri quindi
            // processarlo 2 volte è innocuo.
            console.error(`stripe-webhook: Idempotency check failed for event ${event.id}:`, insertError.message);
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

                // Fetch subscription to get quantity (paid_seats) and trial_end
                let paidSeats = 1;
                let trialUntil: string | null = null;
                try {
                    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                    paidSeats = getSubscriptionQuantity(sub);
                    if (sub.trial_end) {
                        trialUntil = new Date(sub.trial_end * 1000).toISOString();
                    }
                } catch (err) {
                    console.warn("stripe-webhook: Could not retrieve subscription for quantity/trial_end:", err.message);
                }

                const { error } = await admin
                    .from("tenants")
                    .update({
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: stripeSubscriptionId,
                        subscription_status: "trialing",
                        paid_seats: paidSeats,
                        trial_until: trialUntil
                    })
                    .eq("id", tenantId);

                if (error) {
                    console.error("stripe-webhook: Failed to update tenant on checkout:", error.message);
                } else {
                    console.log(`stripe-webhook: Tenant ${tenantId} linked to subscription ${stripeSubscriptionId} (${paidSeats} seats)`);
                }
                break;
            }

            case "customer.subscription.updated": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;
                const newStatus = mapStripeStatus(subscription.status);
                const paidSeats = getSubscriptionQuantity(subscription);
                const trialUntil = subscription.trial_end
                    ? new Date(subscription.trial_end * 1000).toISOString()
                    : null;

                const result = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: newStatus,
                    paid_seats: paidSeats,
                    trial_until: trialUntil
                });

                if (result.ok && result.rowsAffected > 0) {
                    console.log(`stripe-webhook: Subscription updated → status=${newStatus}, seats=${paidSeats} for customer ${stripeCustomerId} (event ${event.id})`);
                } else if (result.ok && result.rowsAffected === 0) {
                    console.warn(`stripe-webhook: NO TENANT MATCHED customer ${stripeCustomerId} for event ${event.id} (${event.type}). Possibile causa: evento da ambiente diverso o tenant eliminato.`);
                }
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;

                const result = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: "canceled"
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

        // Always return 200 to Stripe to acknowledge receipt
        return json(200, { received: true });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const stack = err instanceof Error ? err.stack : null;
        console.error("stripe-webhook: Unhandled error:", message);

        // Audit trail: scrive in webhook_errors per debug post-mortem.
        // Race-safe: se questo INSERT fallisce, ignoriamo (siamo già in error path).
        try {
            const SUPABASE_URL_ERR = Deno.env.get("SUPABASE_URL");
            const SUPABASE_KEY_ERR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (SUPABASE_URL_ERR && SUPABASE_KEY_ERR) {
                const auditAdmin = createClient(SUPABASE_URL_ERR, SUPABASE_KEY_ERR);
                await auditAdmin.from("webhook_errors").insert({
                    source: "stripe-webhook",
                    event_id: event?.id ?? null,
                    event_type: event?.type ?? null,
                    error_message: message,
                    error_stack: stack,
                    payload: event ?? null
                });
            }
        } catch (auditErr) {
            console.error("stripe-webhook: Failed to write audit trail:", auditErr);
        }

        // Return 200 to prevent Stripe from retrying on app errors
        return json(200, { received: true, error: message });
    }
});
