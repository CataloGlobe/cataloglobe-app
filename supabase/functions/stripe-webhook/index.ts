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
async function updateTenantStatus(
    admin: ReturnType<typeof createClient>,
    stripeCustomerId: string,
    updates: Record<string, unknown>
): Promise<boolean> {
    const { error } = await admin
        .from("tenants")
        .update(updates)
        .eq("stripe_customer_id", stripeCustomerId);

    if (error) {
        console.error(`stripe-webhook: DB update failed for customer ${stripeCustomerId}:`, error.message);
        return false;
    }
    return true;
}

/**
 * Extract the total quantity from the first line item (seat-based pricing).
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
        let event: Stripe.Event;

        try {
            event = await stripe.webhooks.constructEventAsync(rawBody, signature, STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            console.error("stripe-webhook: Signature verification failed:", err.message);
            return json(400, { error: "invalid_signature" });
        }

        console.log(`stripe-webhook: Received event ${event.type} (${event.id})`);

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

                // Fetch subscription to get quantity (paid_seats)
                let paidSeats = 1;
                try {
                    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                    paidSeats = getSubscriptionQuantity(sub);
                } catch (err) {
                    console.warn("stripe-webhook: Could not retrieve subscription for quantity:", err.message);
                }

                const { error } = await admin
                    .from("tenants")
                    .update({
                        stripe_customer_id: stripeCustomerId,
                        stripe_subscription_id: stripeSubscriptionId,
                        subscription_status: "trialing",
                        paid_seats: paidSeats
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

                const ok = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: newStatus,
                    paid_seats: paidSeats
                });

                if (ok) {
                    console.log(`stripe-webhook: Subscription updated → status=${newStatus}, seats=${paidSeats} for customer ${stripeCustomerId}`);
                }
                break;
            }

            case "customer.subscription.deleted": {
                const subscription = event.data.object as Stripe.Subscription;
                const stripeCustomerId = subscription.customer as string;

                const ok = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: "canceled"
                });

                if (ok) {
                    console.log(`stripe-webhook: Subscription deleted for customer ${stripeCustomerId}`);
                }
                break;
            }

            case "invoice.payment_failed": {
                const invoice = event.data.object as Stripe.Invoice;
                const stripeCustomerId = invoice.customer as string;

                const ok = await updateTenantStatus(admin, stripeCustomerId, {
                    subscription_status: "past_due"
                });

                if (ok) {
                    console.log(`stripe-webhook: Payment failed → past_due for customer ${stripeCustomerId}`);
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
                    await updateTenantStatus(admin, stripeCustomerId, {
                        subscription_status: "active"
                    });
                    console.log(`stripe-webhook: Payment succeeded → active for customer ${stripeCustomerId}`);
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
        console.error("stripe-webhook: Unhandled error:", message);
        // Return 200 to prevent Stripe from retrying on app errors
        return json(200, { received: true, error: message });
    }
});
