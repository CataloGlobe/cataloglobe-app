// sunmi-unbind-printer — scollega una stampante cloud Sunmi da una sede.
//
// Contesto ADMIN (JWT utente Supabase), NON customer JWT.
//
// Pipeline:
//   1. CORS / metodo / parse body { printer_id }.
//   2. Verifica JWT utente.
//   3. Pre-fetch riga `printers` con service_role → 404 se assente.
//   4. Guard permesso: has_permission('tables.manage', printer.activity_id)
//      con il CLIENT UTENTE. Ogni query successiva filtra anche per tenant_id.
//   5. Rate limit per utente.
//   6. Sunmi unbindShop(sn, shop_id della sede).
//        - ok                         → elimina riga
//        - device sconosciuto/assente → elimina comunque riga + log
//        - shop_id NULL sulla sede    → nulla da scollegare lato Sunmi, elimina + log
//        - altro errore / transport   → 502/504, riga MANTENUTA (ritentabile)
//   7. DELETE printers → 200 { deleted: true }.
//
// Error codes:
//   400 INVALID_BODY · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 PRINTER_NOT_FOUND
//   429 RATE_LIMITED · 502 SUNMI_CONFIG_ERROR · 502 SUNMI_ERROR
//   504 SUNMI_UNREACHABLE · 500 INTERNAL_ERROR

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { sunmiUnbindShop } from "../_shared/sunmi.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FUNCTION_NAME = "sunmi-unbind-printer";
const RATE_LIMIT_PER_USER_PER_MIN = 10;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface UnbindRequestBody {
    printer_id: string;
}

interface PrinterRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    sn: string;
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

function _parseAndValidateBody(raw: unknown): UnbindRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body must be a JSON object." };
    const obj = raw as Record<string, unknown>;
    if (typeof obj.printer_id !== "string" || !UUID_RE.test(obj.printer_id)) {
        return { error: "`printer_id` must be a UUID." };
    }
    return { printer_id: obj.printer_id };
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

async function _fetchPrinter(
    supabase: SupabaseClient,
    printerId: string
): Promise<
    | { kind: "ok"; row: PrinterRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("printers")
        .select("id, tenant_id, activity_id, sn")
        .eq("id", printerId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as PrinterRow };
}

async function _fetchShopId(
    supabase: SupabaseClient,
    activityId: string,
    tenantId: string
): Promise<{ kind: "ok"; shopId: number | null } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabase
        .from("activities")
        .select("sunmi_shop_id")
        .eq("id", activityId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    const raw = (data as { sunmi_shop_id: number | null } | null)?.sunmi_shop_id ?? null;
    return { kind: "ok", shopId: raw === null ? null : Number(raw) };
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
        // ── Stampante ──
        const pr = await _fetchPrinter(supabase, body.printer_id);
        if (pr.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] printer fetch error:`, pr.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (pr.kind === "not_found") {
            return jsonResponse(404, { code: "PRINTER_NOT_FOUND", message: "Stampante non trovata." });
        }
        const printer = pr.row;

        // ── Permesso (client utente) ──
        const perm = await _hasTablesManagePermission(supabaseUser, printer.activity_id);
        if (perm.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] has_permission error:`, perm.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (!perm.allowed) {
            // Stesso 404 di "non trovata"? No: la riga esiste ma l'utente non ha
            // il permesso sulla sede. Si risponde 403 senza esporre dettagli.
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Non hai i permessi per gestire le stampanti di questa sede."
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

        // ── Sunmi unbindShop ──
        const shop = await _fetchShopId(supabase, printer.activity_id, printer.tenant_id);
        if (shop.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] shop_id fetch error:`, shop.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        if (shop.shopId === null) {
            // Stato incoerente (riga printers senza shop_id sulla sede): non c'e'
            // nulla da scollegare lato Sunmi. Si pulisce il locale e si logga.
            console.warn(`[${FUNCTION_NAME}] printer without shop_id, local delete only`, {
                printer_id: printer.id,
                activity_id: printer.activity_id
            });
        } else {
            const unbind = await sunmiUnbindShop(printer.sn, shop.shopId);
            if (unbind.kind === "config_error") {
                console.error(`[${FUNCTION_NAME}] sunmi config error:`, unbind.message);
                return jsonResponse(502, {
                    code: "SUNMI_CONFIG_ERROR",
                    message: "Integrazione Sunmi non configurata."
                });
            }
            if (unbind.kind === "transport_error") {
                console.error(`[${FUNCTION_NAME}] sunmi transport error:`, unbind.message);
                return jsonResponse(504, {
                    code: "SUNMI_UNREACHABLE",
                    message: "Sunmi non raggiungibile, riprova tra poco."
                });
            }
            if (unbind.kind === "sunmi_error") {
                if (unbind.category === "device") {
                    // Device sconosciuto o non piu' presente lato Sunmi: la riga
                    // locale e' orfana, si elimina comunque.
                    console.warn(`[${FUNCTION_NAME}] sunmi device unknown on unbind, deleting local row`, {
                        printer_id: printer.id,
                        sunmi_code: unbind.code,
                        msg: unbind.msg
                    });
                } else {
                    console.error(`[${FUNCTION_NAME}] sunmi unbindShop rejected:`, {
                        code: unbind.code,
                        msg: unbind.msg,
                        category: unbind.category,
                        printer_id: printer.id
                    });
                    return jsonResponse(502, {
                        code: unbind.category === "config" ? "SUNMI_CONFIG_ERROR" : "SUNMI_ERROR",
                        message: "Sunmi ha rifiutato lo scollegamento.",
                        details: { sunmi_code: unbind.code }
                    });
                }
            }
        }

        // ── DELETE printers (tenant + id: defense in depth) ──
        const { error: delErr } = await supabase
            .from("printers")
            .delete()
            .eq("id", printer.id)
            .eq("tenant_id", printer.tenant_id);
        if (delErr) {
            console.error(`[${FUNCTION_NAME}] delete error:`, delErr.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }

        console.log(`[${FUNCTION_NAME}] printer_unbound`, {
            event: "printer_unbound",
            printer_id: printer.id,
            activity_id: printer.activity_id
        });
        return jsonResponse(200, { deleted: true, printer_id: printer.id });
    } catch (e) {
        console.error(`[${FUNCTION_NAME}] internal error:`, (e as Error)?.message, (e as Error)?.stack);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
