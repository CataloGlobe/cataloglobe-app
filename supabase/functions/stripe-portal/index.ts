// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { stripeClientOptions } from "../_shared/stripe-helpers.ts";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
};

function json(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// Deep-link flows the client may ask for. The client only names the flow; the
// server builds every URL of it (never taken from the request body).
const ALLOWED_FLOWS = new Set(["payment_method_update"]);

// App origins a flow may redirect back to. Same list as stripe-checkout.
const APP_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com",
];

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
        let payload: { tenantId?: string; returnUrl?: string; flow?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(400, { error: "missing_tenant_id" });

        const flow = payload?.flow?.trim() || null;
        if (flow !== null && !ALLOWED_FLOWS.has(flow)) {
            return json(400, { error: "invalid_flow" });
        }

        // A flow returns to the tenant's Subscription page on the caller's own
        // app origin, allowlisted. Unknown origin → refuse rather than guess.
        let flowReturnUrl: string | null = null;
        if (flow !== null) {
            const origin = req.headers.get("origin") ?? "";
            if (!APP_ORIGINS.includes(origin)) {
                console.warn(`stripe-portal: flow ${flow} refused, origin not allowed: ${origin || "none"}`);
                return json(400, { error: "invalid_origin" });
            }
            flowReturnUrl = `${origin}/business/${encodeURIComponent(tenantId)}/subscription`;
        }

        const returnUrl =
            flowReturnUrl ?? (payload?.returnUrl || `${SUPABASE_URL.replace(".supabase.co", "")}/workspace/billing`);

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
        const stripe = new Stripe(STRIPE_SECRET_KEY, stripeClientOptions());

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: tenantData.stripe_customer_id,
            return_url: returnUrl,
            // Straight to the card form; back on Subscription as soon as it is saved.
            ...(flow === "payment_method_update" && flowReturnUrl
                ? {
                      flow_data: {
                          type: "payment_method_update",
                          after_completion: { type: "redirect", redirect: { return_url: flowReturnUrl } }
                      }
                  }
                : {})
        });

        console.log(`stripe-portal: Portal session created for tenant ${tenantId}${flow ? ` (flow=${flow})` : ""}`);

        return json(200, { portal_url: portalSession.url });
    } catch (err) {
        console.error("stripe-portal: Unhandled error:", err);
        return json(500, { error: "portal_failed" });
    }
});
