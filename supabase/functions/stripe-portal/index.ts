// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@17?target=deno";
import { stripeClientOptions } from "../_shared/stripe-helpers.ts";

// Deep-link flows the client may ask for. The client only names the flow; the
// server builds every URL of it (never taken from the request body).
const ALLOWED_FLOWS = new Set(["payment_method_update"]);

// App origins: CORS allowlist and where a flow may redirect back to. Same list
// as stripe-checkout.
const APP_ORIGINS = [
    "http://localhost:5173",
    "https://staging.cataloglobe.com",
    "https://cataloglobe.com",
    "https://www.cataloglobe.com",
];

function corsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get("origin") ?? "";
    const allowed = APP_ORIGINS.includes(origin) ? origin : "";
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
        const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !STRIPE_SECRET_KEY) {
            console.error("stripe-portal: Missing env vars");
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
            console.error(`stripe-portal: Auth failed: ${authError?.message || "no user"}`);
            return json(req, 401, { error: "unauthorized" });
        }

        // --- Parse body ---
        let payload: { tenantId?: string; returnUrl?: string; flow?: string } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = payload?.tenantId?.trim();
        if (!tenantId) return json(req, 400, { error: "missing_tenant_id" });

        const flow = payload?.flow?.trim() || null;
        if (flow !== null && !ALLOWED_FLOWS.has(flow)) {
            return json(req, 400, { error: "invalid_flow" });
        }

        // Every portal session returns to the caller's own app origin,
        // allowlisted. Unknown origin → refuse rather than guess.
        const origin = req.headers.get("origin") ?? "";
        if (!APP_ORIGINS.includes(origin)) {
            console.warn(`stripe-portal: refused, origin not allowed: ${origin || "none"}`);
            return json(req, 400, { error: "invalid_origin" });
        }
        const subscriptionUrl = `${origin}/business/${encodeURIComponent(tenantId)}/subscription`;

        // A flow returns to the tenant's Subscription page, never to a URL
        // from the body.
        const flowReturnUrl = flow !== null ? subscriptionUrl : null;

        // Without a flow the client may name the return URL (any path on an
        // app origin); anything else falls back to the Subscription page.
        let returnUrl = flowReturnUrl ?? subscriptionUrl;
        if (flowReturnUrl === null && payload?.returnUrl) {
            let requested: URL | null = null;
            try {
                requested = new URL(payload.returnUrl);
            } catch {
                console.warn("stripe-portal: returnUrl ignored, not a valid URL");
            }
            if (requested && APP_ORIGINS.includes(requested.origin)) {
                returnUrl = requested.href;
            } else if (requested) {
                console.warn(`stripe-portal: returnUrl ignored, origin not allowed: ${requested.origin}`);
            }
        }

        // --- Ownership check + get stripe_customer_id ---
        const { data: tenantData, error: tenantError } = await supabaseUser
            .from("tenants")
            .select("id, owner_user_id, stripe_customer_id")
            .eq("id", tenantId)
            .maybeSingle();

        if (tenantError || !tenantData) {
            console.error("stripe-portal: Tenant not found or not accessible");
            return json(req, 403, { error: "forbidden" });
        }

        if (tenantData.owner_user_id !== userId) {
            console.warn(`stripe-portal: User ${userId} is not owner of tenant ${tenantId}`);
            return json(req, 403, { error: "forbidden" });
        }

        if (!tenantData.stripe_customer_id) {
            console.warn(`stripe-portal: Tenant ${tenantId} has no Stripe customer`);
            return json(req, 400, { error: "no_stripe_customer", message: "Nessun abbonamento attivo per questa attività" });
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

        return json(req, 200, { portal_url: portalSession.url });
    } catch (err) {
        console.error("stripe-portal: Unhandled error:", err);
        return json(req, 500, { error: "portal_failed" });
    }
});
