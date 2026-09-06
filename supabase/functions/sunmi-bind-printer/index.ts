// sunmi-bind-printer — collega una stampante cloud Sunmi a una sede.
//
// Contesto ADMIN (JWT utente Supabase), NON customer JWT.
//
// Pipeline:
//   1. CORS / metodo / parse body { activity_id, sn, label }.
//   2. Verifica JWT utente (auth.getUser con client anon + bearer).
//   3. Pre-fetch sede con service_role → 404 se assente. Da qui tenant_id.
//   4. Guard permesso: has_permission('tables.manage', activity_id) invocata
//      con il CLIENT UTENTE (auth.uid() valorizzato). service_role bypassa
//      RLS, quindi il controllo va fatto esplicitamente e ogni query
//      successiva filtra anche per tenant_id (defense in depth).
//   5. Rate limit per utente.
//   6. Se esiste gia' una riga `printers` con lo stesso sn:
//        - stessa sede  → 200 idempotente (riga esistente)
//        - altra sede   → 409 PRINTER_SN_IN_USE
//   7. Assegna `activities.sunmi_shop_id` se assente (RPC assign_sunmi_shop_id,
//      lazy + race-safe).
//   8. Sunmi bindShop. `10071702` (gia' bound) = successo idempotente.
//      Qualsiasi altro errore → NESSUN INSERT (niente stampanti fantasma).
//   9. INSERT printers → 201 { printer }.
//
// Error codes:
//   400 INVALID_BODY · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 ACTIVITY_NOT_FOUND
//   409 PRINTER_SN_IN_USE · 422 ORDERING_DISABLED · 422 SUNMI_DEVICE_REJECTED
//   429 RATE_LIMITED · 502 SUNMI_CONFIG_ERROR · 502 SUNMI_ERROR
//   504 SUNMI_UNREACHABLE · 500 INTERNAL_ERROR

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { SUNMI_CODES, sunmiBindShop } from "../_shared/sunmi.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FUNCTION_NAME = "sunmi-bind-printer";
const RATE_LIMIT_PER_USER_PER_MIN = 10;
const MAX_LABEL_LENGTH = 60;
// Serial number Sunmi: alfanumerico, osservato 12-16 caratteri; teniamo margine.
const SN_RE = /^[A-Z0-9]{6,32}$/;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface BindRequestBody {
    activity_id: string;
    sn: string;
    label: string;
}

interface ActivityRow {
    id: string;
    tenant_id: string;
    ordering_enabled: boolean;
    sunmi_shop_id: number | null;
}

interface PrinterRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    sn: string;
    label: string;
    is_active: boolean;
    last_online_at: string | null;
    created_at: string;
    updated_at: string;
}

// ============================================================
// Helpers
// ============================================================

function jsonResponse(status: number, body: Record<string, unknown>): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders }
    });
}

function _parseAndValidateBody(raw: unknown): BindRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body must be a JSON object." };
    const obj = raw as Record<string, unknown>;

    if (typeof obj.activity_id !== "string" || !UUID_RE.test(obj.activity_id)) {
        return { error: "`activity_id` must be a UUID." };
    }
    if (typeof obj.sn !== "string") return { error: "`sn` must be a string." };
    const sn = obj.sn.trim().toUpperCase();
    if (!SN_RE.test(sn)) {
        return { error: "`sn` must be 6-32 alphanumeric characters." };
    }
    if (typeof obj.label !== "string") return { error: "`label` must be a string." };
    const label = obj.label.trim();
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
        return { error: `\`label\` must be 1-${MAX_LABEL_LENGTH} characters.` };
    }
    return { activity_id: obj.activity_id, sn, label };
}

function _extractBearerJwt(req: Request): string | null {
    const h = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!h || !h.toLowerCase().startsWith("bearer ")) return null;
    const jwt = h.slice(7).trim();
    return jwt.length > 0 ? jwt : null;
}

async function _validateUserJwt(
    jwt: string
): Promise<
    | { kind: "ok"; userId: string; supabaseUser: SupabaseClient }
    | { kind: "invalid"; message: string }
> {
    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data, error } = await supabaseUser.auth.getUser(jwt);
    if (error || !data?.user?.id) {
        return { kind: "invalid", message: error?.message ?? "Invalid JWT" };
    }
    return { kind: "ok", userId: data.user.id, supabaseUser };
}

async function _hasTablesManagePermission(
    supabaseUser: SupabaseClient,
    activityId: string
): Promise<{ kind: "ok"; allowed: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: "tables.manage",
        p_activity_id: activityId
    });
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", allowed: data === true };
}

async function _fetchActivity(
    supabase: SupabaseClient,
    activityId: string
): Promise<
    | { kind: "ok"; row: ActivityRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("activities")
        .select("id, tenant_id, ordering_enabled, sunmi_shop_id")
        .eq("id", activityId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ActivityRow };
}

async function _fetchPrinterBySn(
    supabase: SupabaseClient,
    sn: string
): Promise<
    | { kind: "ok"; row: PrinterRow | null }
    | { kind: "db_error"; message: string }
> {
    // sn e' UNIQUE globale: la lookup e' volutamente cross-tenant, serve a
    // rifiutare un dispositivo gia' collegato altrove (409). Il tenant_id della
    // riga trovata NON viene mai esposto al chiamante.
    const { data, error } = await supabase
        .from("printers")
        .select("*")
        .eq("sn", sn)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", row: (data as PrinterRow | null) ?? null };
}

async function _ensureShopId(
    supabase: SupabaseClient,
    activity: ActivityRow
): Promise<{ kind: "ok"; shopId: number } | { kind: "db_error"; message: string }> {
    if (activity.sunmi_shop_id !== null) {
        return { kind: "ok", shopId: Number(activity.sunmi_shop_id) };
    }
    const { data, error } = await supabase.rpc("assign_sunmi_shop_id", {
        p_activity_id: activity.id
    });
    if (error) return { kind: "db_error", message: error.message };
    const shopId = Number(data);
    if (!Number.isFinite(shopId) || shopId <= 0) {
        return { kind: "db_error", message: "assign_sunmi_shop_id returned no id" };
    }
    return { kind: "ok", shopId };
}

// ============================================================
// Main
// ============================================================

serve(async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") {
        return jsonResponse(405, { code: "METHOD_NOT_ALLOWED", message: "Use POST." });
    }

    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return jsonResponse(400, { code: "INVALID_BODY", message: "Invalid JSON body." });
    }
    const body = _parseAndValidateBody(rawBody);
    if ("error" in body) {
        return jsonResponse(400, { code: "INVALID_BODY", message: body.error });
    }

    const jwt = _extractBearerJwt(req);
    if (!jwt) {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: "Authorization header mancante o malformato."
        });
    }
    const auth = await _validateUserJwt(jwt);
    if (auth.kind === "invalid") {
        return jsonResponse(401, { code: "UNAUTHORIZED", message: "Sessione non valida." });
    }
    const { userId, supabaseUser } = auth;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Sede ──
        const act = await _fetchActivity(supabase, body.activity_id);
        if (act.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] activity fetch error:`, act.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (act.kind === "not_found") {
            return jsonResponse(404, { code: "ACTIVITY_NOT_FOUND", message: "Sede non trovata." });
        }
        const activity = act.row;
        const tenantId = activity.tenant_id;

        // ── Permesso (client utente → auth.uid() valorizzato) ──
        const perm = await _hasTablesManagePermission(supabaseUser, activity.id);
        if (perm.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] has_permission error:`, perm.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (!perm.allowed) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Non hai i permessi per gestire le stampanti di questa sede."
            });
        }

        if (!activity.ordering_enabled) {
            return jsonResponse(422, {
                code: "ORDERING_DISABLED",
                message: "Attiva le ordinazioni dal tavolo prima di collegare una stampante."
            });
        }

        // ── Rate limit ──
        try {
            await checkRateLimit(supabase, {
                key: `${FUNCTION_NAME}:user:${userId}`,
                limit: RATE_LIMIT_PER_USER_PER_MIN,
                windowSeconds: 60
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) {
                return jsonResponse(429, {
                    code: "RATE_LIMITED",
                    message: "Troppe richieste, riprova tra poco."
                });
            }
            throw e;
        }

        // ── Idempotenza locale su sn ──
        const existing = await _fetchPrinterBySn(supabase, body.sn);
        if (existing.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] printer lookup error:`, existing.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (existing.row) {
            if (existing.row.activity_id === activity.id && existing.row.tenant_id === tenantId) {
                return jsonResponse(200, { printer: existing.row, already_bound: true });
            }
            return jsonResponse(409, {
                code: "PRINTER_SN_IN_USE",
                message: "Questo dispositivo è già collegato a un'altra sede."
            });
        }

        // ── shop_id lazy ──
        const shop = await _ensureShopId(supabase, activity);
        if (shop.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] assign_sunmi_shop_id error:`, shop.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        // ── Sunmi bindShop ──
        const bind = await sunmiBindShop(body.sn, shop.shopId);
        if (bind.kind === "config_error") {
            console.error(`[${FUNCTION_NAME}] sunmi config error:`, bind.message);
            return jsonResponse(502, {
                code: "SUNMI_CONFIG_ERROR",
                message: "Integrazione Sunmi non configurata."
            });
        }
        if (bind.kind === "transport_error") {
            console.error(`[${FUNCTION_NAME}] sunmi transport error:`, bind.message);
            return jsonResponse(504, {
                code: "SUNMI_UNREACHABLE",
                message: "Sunmi non raggiungibile, riprova tra poco."
            });
        }
        if (bind.kind === "sunmi_error" && bind.code !== SUNMI_CODES.ALREADY_BOUND) {
            console.error(`[${FUNCTION_NAME}] sunmi bindShop rejected:`, {
                code: bind.code,
                msg: bind.msg,
                category: bind.category,
                activity_id: activity.id
            });
            if (bind.category === "device") {
                return jsonResponse(422, {
                    code: "SUNMI_DEVICE_REJECTED",
                    message: "Sunmi non riconosce questo numero di serie. Controlla l'SN sul dispositivo.",
                    details: { sunmi_code: bind.code }
                });
            }
            if (bind.category === "config") {
                return jsonResponse(502, {
                    code: "SUNMI_CONFIG_ERROR",
                    message: "Integrazione Sunmi non configurata correttamente.",
                    details: { sunmi_code: bind.code }
                });
            }
            return jsonResponse(502, {
                code: "SUNMI_ERROR",
                message: "Sunmi ha rifiutato il collegamento.",
                details: { sunmi_code: bind.code }
            });
        }
        if (bind.kind === "sunmi_error") {
            // 10071702: gia' bound lato Sunmi (es. retry dopo un INSERT fallito).
            // Trattato come successo idempotente.
            console.log(`[${FUNCTION_NAME}] sunmi already_bound, proceeding`, {
                activity_id: activity.id
            });
        }

        // ── INSERT printers (solo dopo il successo Sunmi) ──
        const { data: inserted, error: insErr } = await supabase
            .from("printers")
            .insert({
                tenant_id: tenantId,
                activity_id: activity.id,
                sn: body.sn,
                label: body.label
            })
            .select("*")
            .single();
        if (insErr) {
            if (insErr.code === "23505") {
                return jsonResponse(409, {
                    code: "PRINTER_SN_IN_USE",
                    message: "Questo dispositivo è già collegato a un'altra sede."
                });
            }
            console.error(`[${FUNCTION_NAME}] insert error:`, insErr.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        console.log(`[${FUNCTION_NAME}] printer_bound`, {
            event: "printer_bound",
            printer_id: (inserted as PrinterRow).id,
            activity_id: activity.id,
            shop_id: shop.shopId
        });
        return jsonResponse(201, { printer: inserted as PrinterRow, already_bound: false });
    } catch (e) {
        console.error(`[${FUNCTION_NAME}] internal error:`, (e as Error)?.message, (e as Error)?.stack);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
