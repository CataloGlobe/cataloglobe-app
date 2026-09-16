// sunmi-printer-status — stato online delle stampanti Sunmi di una sede.
//
// Contesto ADMIN (JWT utente Supabase), NON customer JWT.
//
// Letta on-demand (apertura tab + pulsante "Aggiorna stato"), MAI persistita:
// vedi commento su `printers.last_online_at` in `_shared/sunmi.ts` — la
// colonna resta NULL, questo endpoint non la scrive. Una sede = un negozio
// Sunmi (`activities.sunmi_shop_id`): una sola chiamata onlineStatus copre
// tutte le sue stampanti.
//
// Pipeline:
//   1. CORS / metodo / parse body { activity_id }.
//   2. Verifica JWT utente.
//   3. Pre-fetch sede con service_role → 404 se assente.
//   4. Guard permesso: has_permission('tables.read', activity_id) con il
//      CLIENT UTENTE (service_role bypassa RLS).
//   5. Rate limit per utente.
//   6. Se la sede non ha ancora `sunmi_shop_id` (nessuna stampante mai
//      collegata) → 200 { available: true, statuses: {} }, nessuna chiamata
//      Sunmi.
//   7. sunmiOnlineStatusByShop(shop_id):
//        - ok                    → 200 { available: true, statuses }
//        - transport_error       → 200 { available: false, statuses: {} }
//          (Sunmi irraggiungibile/timeout: stato NON DETERMINATO, non un
//          errore HTTP — un guasto di rete Sunmi non deve mai leggersi come
//          "stampante offline")
//        - sunmi_error, category "config" → 502 SUNMI_CONFIG_ERROR (bug
//          nostro: credenziali/capability, va risolto, non e' un dato
//          incerto per l'utente)
//        - sunmi_error, altre category    → 200 { available: false }
//          (stato incerto lato Sunmi, non un errore di sistema)
//        - config_error (credenziali assenti) → 502 SUNMI_CONFIG_ERROR
//
// Error codes:
//   400 INVALID_BODY · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 ACTIVITY_NOT_FOUND
//   429 RATE_LIMITED · 502 SUNMI_CONFIG_ERROR · 500 INTERNAL_ERROR

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { sunmiOnlineStatusByShop } from "../_shared/sunmi.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FUNCTION_NAME = "sunmi-printer-status";
const RATE_LIMIT_PER_ACTIVITY_PER_MIN = 10;
const SHOP_PAGE_SIZE = 100;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface StatusRequestBody {
    activity_id: string;
}

interface ActivityRow {
    id: string;
    tenant_id: string;
    sunmi_shop_id: number | null;
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

function _parseAndValidateBody(raw: unknown): StatusRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body must be a JSON object." };
    const obj = raw as Record<string, unknown>;
    if (typeof obj.activity_id !== "string" || !UUID_RE.test(obj.activity_id)) {
        return { error: "`activity_id` must be a UUID." };
    }
    return { activity_id: obj.activity_id };
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

async function _hasTablesReadPermission(
    supabaseUser: SupabaseClient,
    activityId: string
): Promise<{ kind: "ok"; allowed: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: "tables.read",
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
        .select("id, tenant_id, sunmi_shop_id")
        .eq("id", activityId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ActivityRow };
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
    const { supabaseUser } = auth;

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

        // ── Permesso (client utente → auth.uid() valorizzato) ──
        const perm = await _hasTablesReadPermission(supabaseUser, activity.id);
        if (perm.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] has_permission error:`, perm.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (!perm.allowed) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Non hai i permessi per vedere le stampanti di questa sede."
            });
        }

        // ── Rate limit per sede (non per utente): piu' operatori sulla stessa
        // sede condividono lo stesso negozio Sunmi, il limite ha senso solo
        // se condiviso — altrimenti N operatori = N*limit chiamate reali sullo
        // stesso shop_id.
        try {
            await checkRateLimit(supabase, {
                key: `${FUNCTION_NAME}:activity:${activity.id}`,
                limit: RATE_LIMIT_PER_ACTIVITY_PER_MIN,
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

        // ── Nessuna stampante mai collegata: nessuno shop_id, nulla da chiedere ──
        if (activity.sunmi_shop_id === null) {
            return jsonResponse(200, { available: true, statuses: {} });
        }

        // ── Sunmi onlineStatus per l'intero negozio ──
        const status = await sunmiOnlineStatusByShop(
            Number(activity.sunmi_shop_id),
            SHOP_PAGE_SIZE
        );

        if (status.kind === "config_error") {
            console.error(`[${FUNCTION_NAME}] sunmi config error:`, status.message);
            return jsonResponse(502, {
                code: "SUNMI_CONFIG_ERROR",
                message: "Integrazione Sunmi non configurata."
            });
        }
        if (status.kind === "transport_error") {
            // Guasto di rete/timeout verso Sunmi: stato NON DETERMINATO, non un
            // errore HTTP. Il chiamante deve mostrare "sconosciuto", mai "offline".
            console.warn(`[${FUNCTION_NAME}] sunmi unreachable, status unavailable:`, status.message);
            return jsonResponse(200, { available: false, statuses: {} });
        }
        if (status.kind === "sunmi_error") {
            if (status.category === "config") {
                console.error(`[${FUNCTION_NAME}] sunmi onlineStatus rejected (config):`, {
                    code: status.code,
                    msg: status.msg,
                    activity_id: activity.id
                });
                return jsonResponse(502, {
                    code: "SUNMI_CONFIG_ERROR",
                    message: "Integrazione Sunmi non configurata correttamente.",
                    details: { sunmi_code: status.code }
                });
            }
            console.warn(`[${FUNCTION_NAME}] sunmi onlineStatus rejected, status unavailable:`, {
                code: status.code,
                msg: status.msg,
                category: status.category,
                activity_id: activity.id
            });
            return jsonResponse(200, { available: false, statuses: {} });
        }

        const list = status.data.list ?? [];
        const page = status.data.page;
        if (page && page.total > list.length) {
            console.warn(`[${FUNCTION_NAME}] onlineStatus response truncated by pagination`, {
                activity_id: activity.id,
                total: page.total,
                received: list.length,
                page_size: page.page_size
            });
        }

        const statuses: Record<string, boolean> = {};
        for (const entry of list) {
            statuses[entry.sn] = entry.is_online === 1 || entry.is_online === true;
        }

        return jsonResponse(200, { available: true, statuses });
    } catch (e) {
        console.error(`[${FUNCTION_NAME}] internal error:`, (e as Error)?.message, (e as Error)?.stack);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
