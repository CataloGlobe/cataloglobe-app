// @ts-nocheck
// ---------------------------------------------------------------------------
// update-billing-details — unico punto d'ingresso per salvare i dati fiscali
// del tenant (Impostazioni + ripresa wizard).
//
// 1. RPC `update_tenant_billing_details` col JWT dell'utente: permesso
//    (tenant.manage), gate P.IVA e gate recapito e-fattura restano nel DB.
//    Errori: insufficient_permission, invalid_vat_number e
//    missing_einvoice_recipient con message e code della RPC (403, 400, 400);
//    ogni altro errore di classe 22 o 23 → 400 invalid_billing_details, senza
//    testo Postgres.
// 2. Se il tenant ha gia' un customer Stripe, riallinea name, address,
//    description, locale, metadata fiscali e tax id (service_role). Senza, il
//    prossimo checkout fa il pre-fill. Mai email ne' metadata.user_id: seguono
//    l'owner, e qui puo' arrivare anche un admin.
//
// La sync Stripe e' best-effort: i dati sono gia' salvati nel DB, un errore
// Stripe NON fa fallire la richiesta (200 + `stripe_sync`). Il prossimo
// salvataggio o checkout riallinea.
// ---------------------------------------------------------------------------
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createStripeClient } from "../_shared/stripe-helpers.ts";
import { syncStripeCustomerProfile, TENANT_FISCAL_COLUMNS } from "../_shared/stripeCustomerProfile.ts";
import { appCorsHeaders } from "../_shared/cors.ts";

function corsHeaders(req: Request): Record<string, string> {
    return appCorsHeaders(req.headers.get("origin"), { json: true });
}

function json(req: Request, status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), { status, headers: corsHeaders(req) });
}

// Campi della RPC, nell'ordine dei parametri `p_<campo>`.
const BILLING_FIELDS = [
    "legal_entity_type",
    "legal_name",
    "vat_number",
    "fiscal_code",
    "first_name",
    "last_name",
    "pec",
    "codice_destinatario",
    "address",
    "street_number",
    "postal_code",
    "city",
    "province",
    "country"
] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Message sollevati dalla RPC (RAISE EXCEPTION), gli unici restituiti al client.
const EXPOSED_RPC_MESSAGES = new Set([
    "insufficient_permission",
    "invalid_vat_number",
    "missing_einvoice_recipient"
]);

/** 42501 → 403; data exception / integrity violation → 400; resto → 500. */
function statusForRpcError(code: string | undefined): number {
    if (code === "42501") return 403;
    if (code?.startsWith("22") || code?.startsWith("23")) return 400;
    return 500;
}

/**
 * Re-read the saved fiscal row (service_role: the RPC just authorized the
 * caller on this tenant) and align the Stripe customer, if there is one.
 */
async function syncStripeForTenant(supabaseUrl: string, serviceRoleKey: string, tenantId: string): Promise<string> {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: tenantRow, error: tenantError } = await supabaseAdmin
        .from("tenants")
        .select(`stripe_customer_id, ${TENANT_FISCAL_COLUMNS}`)
        .eq("id", tenantId)
        .maybeSingle();

    if (tenantError || !tenantRow) {
        console.error(
            `update-billing-details: tenant re-read failed tenant=${tenantId} code=${tenantError?.code ?? "no_row"}`
        );
        return "error";
    }

    if (!tenantRow.stripe_customer_id) return "skipped_no_customer";

    const stripe = createStripeClient();
    if (!stripe) {
        console.error("update-billing-details: STRIPE_SECRET_KEY missing, sync skipped");
        return "error";
    }

    const { stripe_customer_id: customerId, ...fiscal } = tenantRow;
    return await syncStripeCustomerProfile(stripe, customerId, tenantId, fiscal, {
        fn: "update-billing-details",
        tenant_id: tenantId
    });
}

serve(async req => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

    try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
            console.error("update-billing-details: Missing env vars");
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
        let payload: { tenantId?: unknown; billing?: Record<string, unknown> } | null = null;
        try {
            payload = await req.json();
        } catch {
            return json(req, 400, { error: "invalid_json" });
        }

        const tenantId = typeof payload?.tenantId === "string" ? payload.tenantId.trim() : "";
        if (!UUID_RE.test(tenantId)) return json(req, 400, { error: "missing_tenant_id" });

        const billing = payload?.billing;
        if (!billing || typeof billing !== "object") return json(req, 400, { error: "invalid_payload" });

        const rpcArgs: Record<string, string | null> = { p_tenant_id: tenantId };
        for (const field of BILLING_FIELDS) {
            const value = billing[field];
            if (value !== null && value !== undefined && typeof value !== "string") {
                return json(req, 400, { error: "invalid_payload" });
            }
            rpcArgs[`p_${field}`] = value ?? null;
        }

        // --- 1. Save (user JWT: permission + P.IVA gate enforced by the RPC) ---
        const { error: rpcError } = await supabaseUser.rpc("update_tenant_billing_details", rpcArgs);
        if (rpcError) {
            const status = statusForRpcError(rpcError.code);
            // Mai il payload ne' il message nei log: solo SQLSTATE e status.
            console.warn(
                `update-billing-details: rpc rejected tenant=${tenantId} code=${rpcError.code} status=${status}`
            );
            if (status === 500) {
                return json(req, 500, { error: "rpc_failed", code: rpcError.code ?? null });
            }
            // Solo i message della RPC arrivano al client. Un 42501 di Postgres
            // resta un 403 insufficient_permission; ogni altro errore di classe
            // 22 o 23 diventa generico, senza testo Postgres.
            if (EXPOSED_RPC_MESSAGES.has(rpcError.message)) {
                return json(req, status, { error: rpcError.message, code: rpcError.code });
            }
            if (status === 403) {
                return json(req, 403, { error: "insufficient_permission", code: "42501" });
            }
            return json(req, 400, { error: "invalid_billing_details", code: "invalid_billing_details" });
        }

        // --- 2. Stripe sync (best-effort: data is already saved, never a 5xx from here) ---
        let stripeSync: string;
        try {
            stripeSync = await syncStripeForTenant(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, tenantId);
        } catch (err) {
            console.error(`update-billing-details: stripe sync threw tenant=${tenantId} name=${(err as Error)?.name}`);
            stripeSync = "error";
        }
        return json(req, 200, { ok: true, stripe_sync: stripeSync });
    } catch (err) {
        console.error(`update-billing-details: unexpected error name=${(err as Error)?.name}`);
        return json(req, 500, { error: "internal_error" });
    }
});
