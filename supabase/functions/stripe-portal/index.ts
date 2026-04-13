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
            console.error("stripe-portal: Missing env vars");
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
            console.error(`stripe-portal: Auth failed: ${authError?.message || "no user"}`);
            return json(401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: { tenantId?: string; returnUrl?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        const returnUrl = payload?.returnUrl || `${SUPABASE_URL.replace(".supabase.co", "")}/workspace/billing`;

        // --- Ownership check + get stripe_customer_id ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            console.error("stripe-portal: Tenant not found or not accessible");
            return json(403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            console.warn(`stripe-portal: User ${userId} is not owner of tenant ${tenantId}`);
            return json(403, { error: "forbidden" });
        }

        if (!tenantData.stripe_customer_id) {
            console.warn(`stripe-portal: Tenant ${tenantId} has no Stripe customer`);
            return json(400, { error: "no_stripe_customer", message: "Nessun abbonamento attivo per questa attività" });
        }

        // --- Create Billing Portal Session ---
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2025-04-30.basil" });

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: tenantData.stripe_customer_id,
            return_url: returnUrl
        });

        console.log(`stripe-portal: Portal session created for tenant ${tenantId}`);

        return json(200, { portal_url: portalSession.url });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("stripe-portal: Unhandled error:", message);
        return json(500, { error: "portal_failed", detail: message });
    }
});
