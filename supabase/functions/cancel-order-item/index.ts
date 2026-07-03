// @ts-nocheck
//
// cancel-order-item — admin-side endpoint that soft-cancels a single
// order_item on a NON-served order (submitted | acknowledged | ready),
// without creating a rectification (storno).
//
// Unlike the admin state-transition endpoints (acknowledge-order, …) this
// does not transition the order via the shared optimistic-lock helper; it
// invokes the cancel_order_item_atomic RPC, which locks the parent order
// (FOR UPDATE), flags the line, adjusts the total and auto-cancels the
// order when no active line remains — all in one transaction.
//
// Pipeline (mirrors rectify-order):
//   1. Method check (POST). Body: { order_id, order_item_id, reason? }.
//   2. Parse + validate body (shape only; business invariants in the RPC).
//   3. Validate Supabase user JWT (Authorization: Bearer ...).
//   4. Pre-fetch the order via service_role to read tenant_id (404 if gone).
//   5. Membership check via supabaseUser.rpc("get_my_tenant_ids"). 403 if
//      the user is not a member of the order's tenant.
//   6. Rate limit per (user, order) at 30 req/min.
//   7. Invoke RPC cancel_order_item_atomic.
//   8. Map the RPC's prefixed RAISE messages to HTTP responses.
//   9. Reply 200 with { order_id, item_id, new_order_total, order_cancelled }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_USER_PER_ORDER_PER_MIN = 30;
const MAX_REASON_LENGTH = 500;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface CancelOrderItemRequestBody {
    order_id: string;
    order_item_id: string;
    reason: string | null;
}

interface OrderRow {
    id: string;
    tenant_id: string;
    activity_id: string;
}

interface RpcSuccessPayload {
    order_id: string;
    item_id: string;
    new_order_total: number;
    order_cancelled: boolean;
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

function _parseAndValidateBody(
    raw: unknown
): CancelOrderItemRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    if (!_isUuid(obj.order_id)) {
        return { error: "`order_id` must be a UUID." };
    }
    if (!_isUuid(obj.order_item_id)) {
        return { error: "`order_item_id` must be a UUID." };
    }

    let reason: string | null = null;
    if (obj.reason !== undefined && obj.reason !== null) {
        if (typeof obj.reason !== "string") {
            return { error: "`reason` must be a string or null." };
        }
        const trimmed = obj.reason.trim();
        if (trimmed.length > MAX_REASON_LENGTH) {
            return {
                error: `\`reason\` must be at most ${MAX_REASON_LENGTH} characters.`
            };
        }
        reason = trimmed.length > 0 ? trimmed : null;
    }

    return {
        order_id: obj.order_id as string,
        order_item_id: obj.order_item_id as string,
        reason
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
): Promise<
    { kind: "ok"; member: boolean } | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabaseUser.rpc("get_my_tenant_ids");
    if (error) {
        return { kind: "db_error", message: error.message };
    }
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

// Permission gate (FASE 2, approccio A): oltre all'appartenenza al tenant
// l'utente deve avere `orders.manage` SULLA sede dell'ordine. La RPC finale
// gira in service_role (RLS bypassata) e non controlla i permessi: questo è
// l'unico layer che li verifica. Chiamato con la user-client (JWT valido →
// auth.uid() popolato, richiesto da has_permission). Fail-closed: qualunque
// errore RPC → false (nega), MAI concedere in dubbio.
async function _hasOrdersManage(
    supabaseUser: SupabaseClient,
    activityId: string
): Promise<boolean> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: "orders.manage",
        p_activity_id: activityId
    });
    if (error) {
        console.error("[cancel-order-item] has_permission read error:", error.message);
        return false;
    }
    return data === true;
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

function _mapRpcError(rpcError: { code?: string; message?: string }): Response {
    const errMsg = rpcError.message ?? "";

    if (errMsg === "ORDER_NOT_FOUND") {
        return jsonResponse(404, {
            code: "ORDER_NOT_FOUND",
            message: "Ordine non trovato."
        });
    }
    if (errMsg.startsWith("INVALID_TARGET:")) {
        return jsonResponse(422, {
            code: "INVALID_TARGET",
            message: "Impossibile annullare un articolo di una rettifica."
        });
    }
    if (errMsg.startsWith("INVALID_STATE_FOR_CANCEL:")) {
        // "INVALID_STATE_FOR_CANCEL: order must be ... got delivered"
        const match = errMsg.match(/got (\w+)/);
        const currentStatus = match ? match[1] : null;
        return jsonResponse(422, {
            code: "INVALID_STATE_FOR_CANCEL",
            message: "Ordine non in stato annullabile.",
            details: { current_status: currentStatus, raw: errMsg }
        });
    }
    if (errMsg.startsWith("ITEM_NOT_FOUND:")) {
        return jsonResponse(422, {
            code: "INVALID_ITEM",
            message: "Articolo non trovato nell'ordine.",
            details: { reason: "ITEM_NOT_FOUND", raw: errMsg }
        });
    }
    if (errMsg.startsWith("ITEM_ALREADY_CANCELLED:")) {
        return jsonResponse(422, {
            code: "INVALID_ITEM",
            message: "Articolo già annullato.",
            details: { reason: "ITEM_ALREADY_CANCELLED", raw: errMsg }
        });
    }
    console.error("[cancel-order-item] RPC unexpected error:", errMsg);
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
    const body = parsed as CancelOrderItemRequestBody;

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
        // ── Pre-fetch order (to derive tenant for membership check) ──
        const orderFetch = await _fetchOrder(supabaseService, body.order_id);
        if (orderFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "ORDER_NOT_FOUND",
                message: "Ordine non trovato."
            });
        }
        if (orderFetch.kind === "db_error") {
            console.error("[cancel-order-item] order read error:", orderFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const tenantId = orderFetch.row.tenant_id;

        // ── Membership check ──
        const membership = await _isMemberOfTenant(supabaseUser, tenantId);
        if (membership.kind === "db_error") {
            console.error(
                "[cancel-order-item] tenant membership read error:",
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
                message: "Operazione non autorizzata su questo ordine."
            });
        }

        // ── Permission gate: orders.manage on the order's activity ──
        // Fail-closed: if activity_id is missing (should never happen —
        // orders.activity_id is NOT NULL) deny rather than risk an unscoped
        // grant. The order is already fetched above.
        const orderActivityId = orderFetch.row.activity_id;
        if (!orderActivityId) {
            console.error("[cancel-order-item] order has no activity_id");
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Operazione non autorizzata su questo ordine."
            });
        }
        const canManage = await _hasOrdersManage(supabaseUser, orderActivityId);
        if (!canManage) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Operazione non autorizzata su questo ordine."
            });
        }

        // ── Rate limit per (user, order) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `cancel-order-item:user:${userId}:order:${body.order_id}`,
                limit: RATE_LIMIT_PER_USER_PER_ORDER_PER_MIN,
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

        // ── Invoke RPC ──
        const { data: rpcData, error: rpcError } = await supabaseService.rpc(
            "cancel_order_item_atomic",
            {
                p_order_id: body.order_id,
                p_order_item_id: body.order_item_id,
                p_reason: body.reason
            }
        );

        if (rpcError) {
            return _mapRpcError(rpcError as { code?: string; message?: string });
        }
        if (!rpcData || typeof rpcData !== "object") {
            console.error("[cancel-order-item] RPC returned no payload");
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const payload = rpcData as RpcSuccessPayload;

        console.log("[cancel-order-item] order_item_cancelled", {
            event: "order_item_cancelled",
            user_id: userId,
            tenant_id: tenantId,
            order_id: payload.order_id,
            item_id: payload.item_id,
            order_cancelled: payload.order_cancelled
        });

        return jsonResponse(200, {
            order_id: payload.order_id,
            item_id: payload.item_id,
            new_order_total: payload.new_order_total,
            order_cancelled: payload.order_cancelled
        });
    } catch (e) {
        console.error(
            "[cancel-order-item] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
