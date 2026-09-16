// sunmi-reprint-order — ristampa manuale della comanda su Sunmi cloud printer.
//
// Contesto ADMIN (JWT utente Supabase), NON customer JWT.
//
// Diverso da submit-order/process-print-jobs: qui l'operatore chiede
// esplicitamente di ristampare, anche piu' volte di seguito. Ogni chiamata
// scrive una riga NUOVA in `print_reprints` (nessun UNIQUE, nessun retry
// automatico — vedi header migration 20260914110000_create_print_reprints.sql).
// trade_no e' casuale per riga (crypto.randomUUID() senza trattini = 32 hex,
// il massimo Sunmi): a differenza di print_jobs.trade_no (derivato da
// order_id+printer_id+kind, apposta idempotente), qui NON deve mai
// deduplicare — l'operatore vuole che la ristampa esca di nuovo.
//
// Pipeline:
//   1. CORS / metodo / parse body { order_id }.
//   2. Verifica JWT utente.
//   3. Fetch ordine con service_role → tenant_id, activity_id.
//   4. Guard permesso: has_permission('orders.manage', activity_id) — stesso
//      permesso che governa il resto del menu `...` della card ordine.
//   5. Rate limit PER SEDE (non per utente): piu' operatori sulla stessa
//      sede condividono lo stesso negozio Sunmi, il limite ha senso solo se
//      condiviso.
//   6. Stampanti attive della sede. Nessuna → 422 NO_ACTIVE_PRINTERS.
//   7. buildComanda(order_id) → payload → renderComandaEscPos → pushContent
//      per ogni stampante, in sequenza. Ogni esito (successo/errore) e'
//      scritto come riga in print_reprints, mai lanciato: un fallimento su
//      una stampante non deve impedire il tentativo sulle altre.
//   8. Risposta con il conteggio per stampante: il chiamante mostra un toast
//      che copre anche il caso "stampante offline" (Sunmi accetta comunque
//      il lavoro e lo consegna alla riaccensione).
//
// Error codes:
//   400 INVALID_BODY · 401 UNAUTHORIZED · 403 FORBIDDEN · 404 ORDER_NOT_FOUND
//   422 NO_ACTIVE_PRINTERS · 429 RATE_LIMITED · 500 INTERNAL_ERROR

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import { pushComandaToPrinter } from "../_shared/printJobs.ts";
import { renderComandaEscPos } from "../_shared/escpos.ts";
import { buildComanda } from "../_shared/buildComanda.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const FUNCTION_NAME = "sunmi-reprint-order";
// Per sede, non per utente: piu' operatori in sala condividono lo stesso
// negozio Sunmi, il limite deve valere sul negozio, non su chi lo preme.
const RATE_LIMIT_PER_ACTIVITY_PER_MIN = 20;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface ReprintRequestBody {
    order_id: string;
}

interface OrderRow {
    id: string;
    tenant_id: string;
    activity_id: string;
}

interface PrinterTargetRow {
    id: string;
    sn: string;
}

interface PerPrinterResult {
    printer_id: string;
    ok: boolean;
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

function _parseAndValidateBody(raw: unknown): ReprintRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") return { error: "Body must be a JSON object." };
    const obj = raw as Record<string, unknown>;
    if (typeof obj.order_id !== "string" || !UUID_RE.test(obj.order_id)) {
        return { error: "`order_id` must be a UUID." };
    }
    return { order_id: obj.order_id };
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

async function _hasOrdersManagePermission(
    supabaseUser: SupabaseClient,
    activityId: string
): Promise<{ kind: "ok"; allowed: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: "orders.manage",
        p_activity_id: activityId
    });
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", allowed: data === true };
}

async function _fetchOrder(
    supabase: SupabaseClient,
    orderId: string
): Promise<
    | { kind: "ok"; row: OrderRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("orders")
        .select("id, tenant_id, activity_id")
        .eq("id", orderId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as OrderRow };
}

async function _fetchActivePrinters(
    supabase: SupabaseClient,
    tenantId: string,
    activityId: string
): Promise<
    | { kind: "ok"; rows: PrinterTargetRow[] }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("printers")
        .select("id, sn")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .eq("is_active", true);
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", rows: (data ?? []) as PrinterTargetRow[] };
}

/** trade_no casuale, 32 hex — MAI derivato dai dati (vedi header file). */
function _randomTradeNo(): string {
    return crypto.randomUUID().replace(/-/g, "");
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
        // ── Ordine ──
        const ord = await _fetchOrder(supabase, body.order_id);
        if (ord.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] order fetch error:`, ord.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (ord.kind === "not_found") {
            return jsonResponse(404, { code: "ORDER_NOT_FOUND", message: "Ordine non trovato." });
        }
        const order = ord.row;

        // ── Permesso (client utente → auth.uid() valorizzato) ──
        const perm = await _hasOrdersManagePermission(supabaseUser, order.activity_id);
        if (perm.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] has_permission error:`, perm.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (!perm.allowed) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Non hai i permessi per ristampare le comande di questa sede."
            });
        }

        // ── Rate limit per sede ──
        try {
            await checkRateLimit(supabase, {
                key: `${FUNCTION_NAME}:activity:${order.activity_id}`,
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

        // ── Stampanti attive ──
        const printers = await _fetchActivePrinters(supabase, order.tenant_id, order.activity_id);
        if (printers.kind === "db_error") {
            console.error(`[${FUNCTION_NAME}] printers lookup error:`, printers.message);
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        if (printers.rows.length === 0) {
            return jsonResponse(422, {
                code: "NO_ACTIVE_PRINTERS",
                message: "Nessuna stampante collegata a questa sede."
            });
        }

        // ── Contenuto comanda (una sola build, riusata per tutte le stampanti) ──
        const built = await buildComanda(supabase, order.id);
        if (built.kind !== "ok") {
            const reason = built.kind === "db_error" ? built.message : "order not found";
            console.error(`[${FUNCTION_NAME}] reprint_build_failed`, {
                event: "reprint_build_failed",
                order_id: order.id,
                reason
            });
            return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
        }
        const contentHex = renderComandaEscPos(built.payload);

        // ── Push per stampante: mai lanciare, ogni esito e' una riga in print_reprints ──
        const results: PerPrinterResult[] = [];
        for (const printer of printers.rows) {
            const tradeNo = _randomTradeNo();
            let ok: boolean;
            let lastError: string | null = null;
            try {
                const push = await pushComandaToPrinter(printer.sn, tradeNo, contentHex);
                ok = push.ok;
                lastError = push.ok ? null : push.error;
            } catch (e) {
                ok = false;
                lastError = (e as Error)?.message ?? "unknown";
            }

            const { error: insertErr } = await supabase.from("print_reprints").insert({
                tenant_id: order.tenant_id,
                activity_id: order.activity_id,
                order_id: order.id,
                printer_id: printer.id,
                trade_no: tradeNo,
                status: ok ? "done" : "failed",
                last_error: lastError,
                requested_by: auth.userId
            });
            if (insertErr) {
                console.error(`[${FUNCTION_NAME}] print_reprints insert error:`, insertErr.message);
            }

            console.log(`[${FUNCTION_NAME}] reprint_${ok ? "done" : "failed"}`, {
                event: `reprint_${ok ? "done" : "failed"}`,
                order_id: order.id,
                printer_id: printer.id,
                error: lastError
            });
            results.push({ printer_id: printer.id, ok });
        }

        const printedCount = results.filter(r => r.ok).length;
        const failedCount = results.length - printedCount;

        return jsonResponse(200, {
            total: results.length,
            printed: printedCount,
            failed: failedCount
        });
    } catch (e) {
        console.error(`[${FUNCTION_NAME}] internal error:`, (e as Error)?.message, (e as Error)?.stack);
        return jsonResponse(500, { code: "INTERNAL_ERROR", message: "Errore interno." });
    }
});
