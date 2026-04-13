// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
        const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
            console.error("stripe-checkout: Missing env vars");
            return json(500, { error: "server_misconfigured" });
        }

        // --- Auth ---
        const authHeader = req.headers.get("Authorization");
        if (!authHeader?.startsWith("Bearer ")) {
            return json(401, { error: "unauthorized" });
        }

        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: authData, error: authError } = await supabaseUser.auth.getUser();
        const userId = authData?.user?.id;
        const userEmail = authData?.user?.email;

        if (authError || !userId) {
            console.error(`stripe-checkout: Auth failed: ${authError?.message || "no user"}`);
            return json(401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: { tenantId?: string; successUrl?: string; cancelUrl?: string; quantity?: number } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        const quantity = Math.max(1, Math.min(25, Math.floor(Number(payload?.quantity) || 1)));

        const successUrl = payload?.successUrl || `${SUPABASE_URL.replace(".supabase.co", "")}/workspace/billing?session=success`;
        const cancelUrl = payload?.cancelUrl || `${SUPABASE_URL.replace(".supabase.co", "")}/workspace/billing?session=cancel`;

        // --- Ownership check ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            console.error("stripe-checkout: Tenant not found or not accessible");
            return json(403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            console.warn(`stripe-checkout: User ${userId} is not owner of tenant ${tenantId}`);
            return json(403, { error: "forbidden" });
        }

        // --- Stripe ---
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Create or reuse Stripe Customer
        let stripeCustomerId = tenantData.stripe_customer_id;

        if (!stripeCustomerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: { tenant_id: tenantId, user_id: userId }
            });
            stripeCustomerId = customer.id;

            const { error: updateErr } = await supabaseAdmin
                .from("tenants")
                .update({ stripe_customer_id: stripeCustomerId })
                .eq("id", tenantId);

            if (updateErr) {
                console.error("stripe-checkout: Failed to save stripe_customer_id:", updateErr);
                return json(500, { error: "db_update_failed" });
            }
        }

        // Create Checkout Session with per-seat quantity
        const session = await stripe.checkout.sessions.create({
            mode: "subscription",
            customer: stripeCustomerId,
            line_items: [{ price: STRIPE_PRICE_ID, quantity }],
            subscription_data: {
                trial_period_days: 30,
                metadata: { tenant_id: tenantId }
            },
            metadata: { tenant_id: tenantId },
            success_url: successUrl,
            cancel_url: cancelUrl
        });

        console.log(`stripe-checkout: Session ${session.id} created for tenant ${tenantId}`);

        return json(200, { checkout_url: session.url });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("stripe-checkout: Unhandled error:", message);
        return json(500, { error: "checkout_failed", detail: message });
    }
});
