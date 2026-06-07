// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";

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

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-update-seats: Missing env vars");
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
            return json(req, 401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: { tenantId?: string; quantity?: number } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(req, 400, { error: "missing_tenant_id" });

        const newQuantity = Math.floor(Number(payload?.quantity) || 0);
        if (newQuantity < 1) {
            return json(req, 400, { error: "invalid_quantity", detail: "Quantity must be at least 1." });
        }

        // --- Ownership check (also reads plan for cap lookup) ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_subscription_id, plan")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            return json(req, 403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            return json(req, 403, { error: "forbidden" });
        }

        if (!tenantData.stripe_subscription_id) {
            return json(req, 400, { error: "no_subscription", detail: "Tenant has no active subscription." });
        }

        // --- Resolve max_self_service_seats from plans table (service-role read) ---
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        const { data: planRow, error: planErr } = await supabaseAdmin
            .from("plans")
            .select("max_self_service_seats")
            .eq("code", tenantData.plan)
            .maybeSingle();

        if (planErr || !planRow) {
            console.error(`stripe-update-seats: plans lookup failed for ${tenantData.plan}:`, planErr);
            return json(req, 500, { error: "plan_lookup_failed" });
        }

        if (newQuantity > planRow.max_self_service_seats) {
            return json(req, 400, {
                error: "invalid_quantity",
                detail: `Max ${planRow.max_self_service_seats} seats for plan ${tenantData.plan}.`
            });
        }

        // --- Update Stripe subscription quantity ---
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });

        const subscription = await stripe.subscriptions.retrieve(tenantData.stripe_subscription_id);
        const subscriptionItemId = subscription.items?.data?.[0]?.id;

        if (!subscriptionItemId) {
            return json(req, 500, { error: "no_subscription_item" });
        }

        await stripe.subscriptions.update(tenantData.stripe_subscription_id, {
            items: [{ id: subscriptionItemId, quantity: newQuantity }],
            proration_behavior: "create_prorations"
        });

        console.log(`stripe-update-seats: Updated tenant ${tenantId} to ${newQuantity} seats`);

        // The webhook (customer.subscription.updated) will sync paid_seats to DB
        return json(req, 200, { success: true, quantity: newQuantity });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("stripe-update-seats: Unhandled error:", message);
        return json(req, 500, { error: "update_failed", detail: message });
    }
});
