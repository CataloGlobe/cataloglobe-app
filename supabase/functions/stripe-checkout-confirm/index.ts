// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { stripeClientOptions } from "../_shared/stripe-helpers.ts";
import { buildSubscriptionLinkUpdates } from "../_shared/subscriptionSnapshot.ts";

/**
 * stripe-checkout-confirm — links a tenant to its Stripe subscription
 * without waiting for the `checkout.session.completed` webhook.
 *
 * Two modes, same write:
 *   1. `sessionId` present (return from Checkout, `?checkout_session=`):
 *      retrieve the Checkout Session, require it complete and bound to this
 *      tenant, adopt its subscription.
 *   2. `sessionId` absent (self-repair: the user closed the tab after paying
 *      and the webhook never arrived, stripe-checkout answered 409
 *      `subscription_already_active`): list the customer's subscriptions and
 *      adopt the ONE live subscription. More than one live → refuse, a human
 *      has to look.
 *
 * The UPDATE payload comes from `buildSubscriptionLinkUpdates`, the same
 * builder the webhook uses, so both paths write identical rows. The ordering
 * baseline is `subscription.created`, which precedes every event about that
 * subscription: a later webhook still wins on `subscription_status`.
 *
 * Fail-closed everywhere: any doubt → 4xx/5xx, nothing written.
 */

const ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com",
];

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : "";
    return {
        "Access-Control-Allow-Origin": allowed,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Vary": "Origin",
        "Content-Type": "application/json"
    };
}

function json(req: Request, status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

// Same set as the anti double-checkout guard in stripe-checkout: a
// subscription in one of these states is the one the tenant is paying for.
const LIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing", "past_due", "unpaid"]);
// A previous subscription in one of these states may be replaced: this is the
// re-subscribe after cancellation, where the tenant row keeps the old id
// (never cleared by design — see stripe-checkout, one trial per tenant).
const REPLACEABLE_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

const STRIPE_SESSION_ID_RE = /^cs_(live|test)_[A-Za-z0-9]+$/;

interface ConfirmBody {
    tenantId?: string;
    sessionId?: string;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-checkout-confirm: Missing env vars");
            return json(req, 500, { error: "server_misconfigured" });
        }

        // --- Auth ---
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return json(req, 401, { error: "unauthorized" });
        }

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;
        if (authError || !userId) {
            console.error(`stripe-checkout-confirm: Auth failed: ${authError?.message || "no user"}`);
            return json(req, 401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: ConfirmBody | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(req, 400, { error: "missing_tenant_id" });

        const sessionId = payload?.sessionId?.trim() || null;
        if (sessionId !== null && !STRIPE_SESSION_ID_RE.test(sessionId)) {
            return json(req, 400, { error: "invalid_session_id" });
        }

        // --- Ownership check (same rule as stripe-checkout: owner only) ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id, stripe_subscription_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            console.error("stripe-checkout-confirm: Tenant not found or not accessible");
            return json(req, 403, { error: "forbidden" });
        }
        if (tenantData.owner_user_id !== userId) {
            console.warn(`stripe-checkout-confirm: User ${userId} is not owner of tenant ${tenantId}`);
            return json(req, 403, { error: "forbidden" });
        }

        const stripe = new Stripe(STRIPE_SECRET_KEY, stripeClientOptions());

        // --- Resolve the subscription to adopt ---
        let subscription: Stripe.Subscription;
        let stripeCustomerId: string;
        let sessionPlanCode: string | null = null;

        if (sessionId !== null) {
            let session: Stripe.Checkout.Session;
            try {
                session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-checkout-confirm: sessions.retrieve failed for ${sessionId}: ${message}`);
                return json(req, 502, { error: "session_retrieve_failed" });
            }

            // The session must be OUR session for THIS tenant. metadata.tenant_id
            // is written by stripe-checkout on every session it creates.
            if (session.metadata?.tenant_id !== tenantId) {
                console.error(
                    `stripe-checkout-confirm: ANOMALY session_tenant_mismatch — session ${sessionId} bound to tenant ${session.metadata?.tenant_id ?? "?"}, requested by tenant ${tenantId} (user ${userId})`
                );
                return json(req, 403, { error: "session_tenant_mismatch" });
            }
            if (session.mode !== "subscription") {
                return json(req, 409, { error: "session_not_subscription" });
            }
            if (session.status !== "complete") {
                console.log(`stripe-checkout-confirm: session ${sessionId} status=${session.status}, not complete`);
                return json(req, 409, { error: "checkout_not_complete" });
            }
            const expanded = session.subscription;
            if (!expanded || typeof expanded === "string") {
                return json(req, 409, { error: "checkout_not_complete" });
            }
            subscription = expanded;
            stripeCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
            sessionPlanCode = session.metadata?.plan_code ?? null;
        } else {
            // Self-repair mode: no session to trust, only the customer we created.
            if (!tenantData.stripe_customer_id) {
                return json(req, 404, { error: "no_stripe_customer" });
            }
            stripeCustomerId = tenantData.stripe_customer_id;

            let live: Stripe.Subscription[];
            try {
                const list = await stripe.subscriptions.list({
                    customer: stripeCustomerId,
                    status: "all",
                    limit: 20
                });
                live = list.data.filter(s => LIVE_SUBSCRIPTION_STATUSES.has(s.status));
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-checkout-confirm: subscriptions.list failed for ${stripeCustomerId}: ${message}`);
                return json(req, 502, { error: "subscription_check_failed" });
            }

            if (live.length === 0) {
                return json(req, 404, { error: "no_live_subscription" });
            }
            if (live.length > 1) {
                // Two live subscriptions on one customer is exactly the situation
                // this endpoint must not resolve on its own.
                console.warn(
                    `stripe-checkout-confirm: customer ${stripeCustomerId} has ${live.length} live subscriptions (${live.map(s => s.id).join(", ")}); refusing to adopt`
                );
                return json(req, 409, { error: "multiple_live_subscriptions" });
            }
            subscription = live[0];
            // Subscriptions created by stripe-checkout always carry tenant_id.
            // One without it, or with another tenant's, is not ours to adopt.
            if (subscription.metadata?.tenant_id !== tenantId) {
                console.error(
                    `stripe-checkout-confirm: ANOMALY subscription_tenant_mismatch — subscription ${subscription.id} bound to tenant ${subscription.metadata?.tenant_id ?? "?"}, requested by tenant ${tenantId} (user ${userId})`
                );
                return json(req, 403, { error: "subscription_tenant_mismatch" });
            }
        }

        if (!stripeCustomerId) {
            return json(req, 409, { error: "checkout_not_complete" });
        }

        // --- Idempotency / conflict with the current link ---
        const currentSubId = tenantData.stripe_subscription_id as string | null;
        if (currentSubId === subscription.id) {
            console.log(`stripe-checkout-confirm: tenant ${tenantId} already linked to ${subscription.id}`);
            return json(req, 200, {
                status: "already_synced",
                subscription_id: subscription.id,
                subscription_status: subscription.status
            });
        }
        if (currentSubId) {
            // The row points at another subscription. Replace it only if that
            // one is over (re-subscribe after cancellation); otherwise refuse.
            let previous: Stripe.Subscription;
            try {
                previous = await stripe.subscriptions.retrieve(currentSubId);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                console.error(`stripe-checkout-confirm: cannot inspect previous subscription ${currentSubId}: ${message}`);
                return json(req, 502, { error: "subscription_check_failed" });
            }
            if (!REPLACEABLE_SUBSCRIPTION_STATUSES.has(previous.status)) {
                console.error(
                    `stripe-checkout-confirm: ANOMALY subscription_mismatch — tenant ${tenantId} linked to ${currentSubId} (${previous.status}), refusing to replace with ${subscription.id} (user ${userId})`
                );
                return json(req, 409, { error: "subscription_mismatch" });
            }
        }

        // --- Write the link (same payload as the webhook) ---
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const updates = await buildSubscriptionLinkUpdates({
            admin: supabaseAdmin,
            stripe,
            subscription,
            stripeCustomerId,
            appliedAtIso: new Date((subscription.created ?? 0) * 1000).toISOString(),
            sessionPlanCode
        });

        const { error: updateError, count } = await supabaseAdmin
            .from("tenants")
            .update(updates, { count: "exact" })
            .eq("id", tenantId);

        if (updateError) {
            console.error(`stripe-checkout-confirm: tenant update failed for ${tenantId}: ${updateError.message}`);
            return json(req, 500, { error: "tenant_update_failed" });
        }
        if (count === 0) {
            console.error(`stripe-checkout-confirm: no tenant row matched ${tenantId}`);
            return json(req, 500, { error: "tenant_update_failed" });
        }

        console.log(
            `stripe-checkout-confirm: tenant ${tenantId} linked to ${subscription.id} via ${sessionId ? "session" : "adoption"} (status=${updates.subscription_status}, seats=${updates.paid_seats})`
        );
        return json(req, 200, {
            status: "linked",
            subscription_id: subscription.id,
            subscription_status: updates.subscription_status
        });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`stripe-checkout-confirm: unexpected error: ${message}`);
        return json(req, 500, { error: "internal_error" });
    }
});
