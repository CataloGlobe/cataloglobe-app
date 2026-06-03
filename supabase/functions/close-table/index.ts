// @ts-nocheck
//
// close-table — admin-side endpoint che chiude i conti aperti di un
// tavolo. Riscritta per delegare l'ATOMICITA' alla RPC
// `close_table_with_resolution` (migration 20260603120100) e per
// supportare la risoluzione bulk degli ordini ancora aperti
// (submitted/acknowledged/ready) al momento della chiusura:
//
//   - open_orders_action assente + aperti > 0 → 409
//     TABLE_HAS_OPEN_ORDERS + details.open_orders_count. Lo staff deve
//     scegliere come risolvere.
//   - open_orders_action='deliver' → bulk-resolve a 'delivered' +
//     chiusura order_groups, tutto atomico in una tx Postgres.
//   - open_orders_action='cancel'  → bulk-resolve a 'cancelled' +
//     chiusura order_groups, idem.
//   - Nessun aperto → chiusura semplice (action='none').
//
// SEPARAZIONE AUTHZ / ESECUZIONE (vedi commento header della migration
// 20260603120100):
//   - Authorization (chi puo' chiudere) RESTA in questa Edge Function:
//     JWT validation + membership via `get_my_tenant_ids()` sul client
//     user-scoped. Il confine attuale di close-table NON cambia.
//   - La RPC `close_table_with_resolution` e' un esecutore atomico
//     callable SOLO da service_role: REVOKE PUBLIC/anon/authenticated,
//     GRANT solo a service_role. Niente `auth.uid()` ne'
//     `has_permission(...)` lato RPC.
//   - Questa Edge fn, dopo aver validato la membership, chiama la RPC
//     via SERVICE_ROLE e passa il `tenant_id` derivato server-side
//     dalla riga `tables` (mai dal client).
//
// Pipeline:
//   1. Parse + validate body ({ table_id: uuid, open_orders_action?: 'deliver'|'cancel' }).
//   2. Verify Supabase user JWT.
//   3. Pre-fetch table to derive tenant_id (404 if missing or soft-deleted).
//   4. Membership check via supabaseUser.rpc("get_my_tenant_ids").
//   5. Rate-limit per (user, table) at 30 req/min.
//   6. Invoke close_table_with_resolution(p_table_id, p_tenant_id, p_action)
//      via supabaseService (service_role).
//   7. Mappa errori RPC (RAISE EXCEPTION con messaggio code) → HTTP.
//   8. Reply 200 con { table_id, resolved_action, resolved_orders_count,
//      closed_groups_count, closed_orders_count, cleared_bill_count }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_USER_PER_TABLE_PER_MIN = 30;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OpenOrdersAction = "deliver" | "cancel";

// ============================================================
// Types
// ============================================================

interface CloseTableRequestBody {
    table_id: string;
    open_orders_action?: OpenOrdersAction;
}

interface TableRow {
    id: string;
    tenant_id: string;
    deleted_at: string | null;
}

interface CloseTableRpcResult {
    table_id: string;
    resolved_action: "none" | OpenOrdersAction;
    resolved_orders_count: number;
    closed_groups_count: number;
    closed_orders_count: number;
    cleared_bill_count: number;
}

// ============================================================
// Helpers
// ============================================================

function _isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_RE.test(s);
}

function jsonResponse(
    status: number,
    body: Record<string, unknown>,
    extraHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...corsHeaders,
            ...extraHeaders
        }
    });
}

function _parseAndValidateBody(raw: unknown): CloseTableRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;
    if (!_isUuid(obj.table_id)) {
        return { error: "`table_id` must be a UUID." };
    }
    const action = obj.open_orders_action;
    if (action !== undefined && action !== "deliver" && action !== "cancel") {
        return { error: "`open_orders_action` must be 'deliver' or 'cancel' when provided." };
    }
    return {
        table_id: obj.table_id as string,
        open_orders_action: action as OpenOrdersAction | undefined
    };
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

async function _isMemberOfTenant(
    supabaseUser: SupabaseClient,
    tenantId: string
): Promise<{ kind: "ok"; member: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("get_my_tenant_ids");
    if (error) return { kind: "db_error", message: error.message };
    const ids: string[] = [];
    if (Array.isArray(data)) {
        for (const row of data) {
            if (typeof row === "string") ids.push(row);
            else if (row && typeof row === "object" && "get_my_tenant_ids" in row) {
                const v = (row as { get_my_tenant_ids: unknown }).get_my_tenant_ids;
                if (typeof v === "string") ids.push(v);
            }
        }
    }
    return { kind: "ok", member: ids.includes(tenantId) };
}

async function _fetchTable(
    supabase: SupabaseClient,
    tableId: string
): Promise<
    | { kind: "ok"; row: TableRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("tables")
        .select("id, tenant_id, deleted_at")
        .eq("id", tableId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    const row = data as TableRow;
    if (row.deleted_at !== null) return { kind: "not_found" };
    return { kind: "ok", row };
}

/**
 * Mappa il messaggio di un'eccezione RAISE EXCEPTION emesso dalla RPC
 * close_table_with_resolution alla shape di risposta HTTP.
 *
 *   TABLE_NOT_FOUND         → 404
 *   TENANT_MISMATCH         → 500 INTERNAL_ERROR (input server-derived,
 *                              mismatch significa che la riga e' cambiata
 *                              tra pre-fetch ed RPC: bug, non utente)
 *   INVALID_ACTION          → 400 INVALID_REQUEST (filtrato gia' lato
 *                              parse, ma copertura defense-in-depth)
 *   TABLE_HAS_OPEN_ORDERS:N → 409 con details.open_orders_count
 */
function _mapRpcErrorToResponse(message: string): Response {
    if (message === "TABLE_NOT_FOUND") {
        return jsonResponse(404, {
            code: "TABLE_NOT_FOUND",
            message: "Tavolo non trovato."
        });
    }
    if (message === "TENANT_MISMATCH") {
        // Difesa in profondita': il tenant_id passato alla RPC e' derivato
        // server-side dalla riga `tables` letta poche righe prima. Un
        // mismatch indica una race condition o un bug, non un input
        // malformato dell'utente.
        console.error("[close-table] RPC TENANT_MISMATCH — possibile race fetch/UPDATE");
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
    if (message === "INVALID_ACTION") {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "Azione non valida."
        });
    }
    if (message.startsWith("TABLE_HAS_OPEN_ORDERS:")) {
        const countStr = message.slice("TABLE_HAS_OPEN_ORDERS:".length);
        const count = Number.parseInt(countStr, 10);
        return jsonResponse(409, {
            code: "TABLE_HAS_OPEN_ORDERS",
            message:
                "Impossibile chiudere il tavolo: ci sono ordini ancora aperti.",
            details: { open_orders_count: Number.isFinite(count) ? count : 0 }
        });
    }
    // Errore RPC sconosciuto: log + 500 generico.
    console.error("[close-table] RPC unknown error:", message);
    return jsonResponse(500, {
        code: "INTERNAL_ERROR",
        message: "Errore interno."
    });
}

// ============================================================
// HTTP handler
// ============================================================

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonResponse(405, {
            code: "METHOD_NOT_ALLOWED",
            message: "Metodo non consentito."
        });
    }

    // ── Parse body ──
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "Body JSON malformato."
        });
    }
    const parsed = _parseAndValidateBody(rawBody);
    if ("error" in parsed) {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: parsed.error
        });
    }
    const { table_id: tableId, open_orders_action: requestedAction } =
        parsed as CloseTableRequestBody;

    // ── Extract + validate JWT ──
    const jwt = _extractBearerJwt(req);
    if (!jwt) {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: "Authorization header mancante o malformato."
        });
    }
    const jwtCheck = await _validateUserJwt(jwt);
    if (jwtCheck.kind === "invalid") {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: jwtCheck.message
        });
    }
    const userId = jwtCheck.userId;
    const supabaseUser = jwtCheck.supabaseUser;

    // ── Build service-role client ──
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Pre-fetch table (derive tenant + reject soft-deleted) ──
        const tableFetch = await _fetchTable(supabaseService, tableId);
        if (tableFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "TABLE_NOT_FOUND",
                message: "Tavolo non trovato."
            });
        }
        if (tableFetch.kind === "db_error") {
            console.error("[close-table] table read error:", tableFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const tenantId = tableFetch.row.tenant_id;

        // ── Membership check (authz: confine invariato vs versione pre-RPC) ──
        const membership = await _isMemberOfTenant(supabaseUser, tenantId);
        if (membership.kind === "db_error") {
            console.error(
                "[close-table] tenant membership read error:",
                membership.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (!membership.member) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Operazione non autorizzata su questo tavolo."
            });
        }

        // ── Rate limit per (user, table) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `close-table:user:${userId}:table:${tableId}`,
                limit: RATE_LIMIT_PER_USER_PER_TABLE_PER_MIN,
                windowSeconds: 60
            });
        } catch (e) {
            if (e instanceof RateLimitExceededError) {
                return jsonResponse(
                    429,
                    {
                        code: "RATE_LIMITED",
                        message: "Troppe richieste, riprova tra poco.",
                        retry_after_seconds: e.retryAfterSeconds
                    },
                    { "Retry-After": String(e.retryAfterSeconds) }
                );
            }
            throw e;
        }

        // ── Invoca RPC atomica via service_role ──
        // p_tenant_id e' SERVER-DERIVED (dalla riga tables sopra), mai dal
        // client. La RPC e' callable solo da service_role (REVOKE
        // FROM PUBLIC + anon + authenticated, GRANT TO service_role).
        const rpcAction = requestedAction ?? "none";
        const { data: rpcData, error: rpcError } = await supabaseService.rpc(
            "close_table_with_resolution",
            {
                p_table_id: tableId,
                p_tenant_id: tenantId,
                p_action: rpcAction
            }
        );

        if (rpcError) {
            return _mapRpcErrorToResponse(rpcError.message ?? "");
        }

        const result = rpcData as CloseTableRpcResult | null;
        if (!result) {
            console.error("[close-table] RPC returned empty result");
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Success ──
        console.log("[close-table] table_closed", {
            event: "table_closed",
            user_id: userId,
            tenant_id: tenantId,
            table_id: tableId,
            resolved_action: result.resolved_action,
            resolved_orders_count: result.resolved_orders_count,
            closed_groups_count: result.closed_groups_count,
            closed_orders_count: result.closed_orders_count,
            cleared_bill_count: result.cleared_bill_count
        });

        return jsonResponse(200, {
            table_id: result.table_id,
            resolved_action: result.resolved_action,
            resolved_orders_count: result.resolved_orders_count,
            closed_groups_count: result.closed_groups_count,
            closed_orders_count: result.closed_orders_count,
            cleared_bill_count: result.cleared_bill_count
        });
    } catch (e) {
        console.error(
            "[close-table] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
