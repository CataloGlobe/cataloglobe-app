// @ts-nocheck
//
// close-table — admin-side endpoint that closes every open order_groups
// row attached to a given table_id. Models the "chiudo il conto" action
// from the staff dashboard.
//
// Semantics (docs/orders-architecture.md §3.4, §11.3, §14):
//   - Only `order_groups` rows are mutated. Their `status` flips from
//     'open' to 'closed' and `closed_at` is set to now(). The `orders`
//     rows themselves are NOT touched; their lifecycle stays governed
//     by the dedicated state-transition endpoints (acknowledge / deliver
//     / cancel-order-admin).
//    - Pre-condition: every order on the table must be in a terminal
//     state. If there is at least one order in `submitted` or
//     `acknowledged`, the request fails with 409 TABLE_HAS_OPEN_ORDERS
//     and `details.open_orders_count`. The staff has to resolve those
//     orders first (Pattern A, §11.3).
//   - Idempotent: closing a table with zero open groups returns 200 with
//     counts at zero. Not an error.
//   - `customer_sessions` that still point at the now-closed groups are
//     left untouched on purpose. The next QR scan re-runs `resolve-table`
//     and that pipeline creates a fresh order_group when needed (§3.5).
//
// Race condition (accepted, documented):
//   - Between the open-orders pre-check and the bulk UPDATE, a new
//     order could be inserted on the same table. That order goes into
//     either a still-existing open group or triggers lazy creation of a
//     new group via submit_order_atomic — either way, the new group is
//     NOT among the rows we close in this request. Idempotent retry by
//     the staff handles the corner case.
//
// Pipeline:
//   1. Parse + validate body ({ table_id: uuid }).
//   2. Verify Supabase user JWT (Authorization: Bearer ...).
//   3. Pre-fetch table to derive tenant_id (404 if missing or soft-deleted).
//   4. Membership check via supabaseUser.rpc("get_my_tenant_ids").
//   5. Rate-limit per (user, table) at 30 req/min.
//   6. Pre-check open orders on the table (409 TABLE_HAS_OPEN_ORDERS).
//   7. Bulk UPDATE order_groups SET status='closed', closed_at=now()
//      WHERE table_id = ? AND status='open' RETURNING id.
//   8. SELECT COUNT(*) FROM orders WHERE order_group_id IN (closed ids).
//   9. Reply 200 with { table_id, closed_groups_count, closed_orders_count }.

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

// ============================================================
// Types
// ============================================================

interface CloseTableRequestBody {
    table_id: string;
}

interface TableRow {
    id: string;
    tenant_id: string;
    deleted_at: string | null;
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
    return { table_id: obj.table_id as string };
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

async function _countOpenOrders(
    supabase: SupabaseClient,
    tableId: string
): Promise<{ kind: "ok"; count: number } | { kind: "db_error"; message: string }> {
    const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("table_id", tableId)
        .in("status", ["submitted", "acknowledged"]);
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", count: count ?? 0 };
}

async function _closeOpenGroups(
    supabase: SupabaseClient,
    tableId: string
): Promise<
    { kind: "ok"; closedIds: string[] } | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("order_groups")
        .update({
            status: "closed",
            closed_at: new Date().toISOString()
        })
        .eq("table_id", tableId)
        .eq("status", "open")
        .select("id");
    if (error) return { kind: "db_error", message: error.message };
    const closedIds = ((data ?? []) as Array<{ id: string }>).map(r => r.id);
    return { kind: "ok", closedIds };
}

async function _countOrdersInGroups(
    supabase: SupabaseClient,
    groupIds: string[]
): Promise<{ kind: "ok"; count: number } | { kind: "db_error"; message: string }> {
    if (groupIds.length === 0) return { kind: "ok", count: 0 };
    const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .in("order_group_id", groupIds);
    if (error) return { kind: "db_error", message: error.message };
    return { kind: "ok", count: count ?? 0 };
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
    const { table_id: tableId } = parsed as CloseTableRequestBody;

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

        // ── Membership check ──
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

        // ── Pre-check: no open orders (submitted/acknowledged) on this table ──
        const openCount = await _countOpenOrders(supabaseService, tableId);
        if (openCount.kind === "db_error") {
            console.error("[close-table] open orders count error:", openCount.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (openCount.count > 0) {
            return jsonResponse(409, {
                code: "TABLE_HAS_OPEN_ORDERS",
                message:
                    "Impossibile chiudere il tavolo: ci sono ordini ancora aperti.",
                details: { open_orders_count: openCount.count }
            });
        }

        // ── Bulk UPDATE: close all open order_groups on this table ──
        const closeResult = await _closeOpenGroups(supabaseService, tableId);
        if (closeResult.kind === "db_error") {
            console.error("[close-table] groups update error:", closeResult.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const closedIds = closeResult.closedIds;

        // ── Count orders attached to those closed groups (informational) ──
        const ordersCount = await _countOrdersInGroups(supabaseService, closedIds);
        if (ordersCount.kind === "db_error") {
            console.error(
                "[close-table] orders aggregate error:",
                ordersCount.message
            );
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
            closed_groups_count: closedIds.length,
            closed_orders_count: ordersCount.count
        });

        return jsonResponse(200, {
            table_id: tableId,
            closed_groups_count: closedIds.length,
            closed_orders_count: ordersCount.count
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
