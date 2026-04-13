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
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-update-seats: Missing env vars");
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

        if (authError || !userId) {
            return json(401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: { tenantId?: string; quantity?: number } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        const newQuantity = Math.floor(Number(payload?.quantity) || 0);
        if (newQuantity < 1 || newQuantity > 25) {
            return json(400, { error: "invalid_quantity", detail: "Quantity must be between 1 and 25." });
        }

        // --- Ownership check ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_subscription_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            return json(403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            return json(403, { error: "forbidden" });
        }

        if (!tenantData.stripe_subscription_id) {
            return json(400, { error: "no_subscription", detail: "Tenant has no active subscription." });
        }

        // --- Update Stripe subscription quantity ---
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });

        const subscription = await stripe.subscriptions.retrieve(tenantData.stripe_subscription_id);
        const subscriptionItemId = subscription.items?.data?.[0]?.id;

        if (!subscriptionItemId) {
            return json(500, { error: "no_subscription_item" });
        }

        await stripe.subscriptions.update(tenantData.stripe_subscription_id, {
            items: [{ id: subscriptionItemId, quantity: newQuantity }],
            proration_behavior: "create_prorations"
        });

        console.log(`stripe-update-seats: Updated tenant ${tenantId} to ${newQuantity} seats`);

        // The webhook (customer.subscription.updated) will sync paid_seats to DB
        return json(200, { success: true, quantity: newQuantity });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("stripe-update-seats: Unhandled error:", message);
        return json(500, { error: "update_failed", detail: message });
    }
});
