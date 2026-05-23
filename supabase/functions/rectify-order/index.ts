// @ts-nocheck
//
// rectify-order — admin-side endpoint that creates a partial rectification
// (storno) for an existing acknowledged/delivered order.
//
// Unlike the three admin state-transition endpoints (acknowledge-order,
// deliver-order, cancel-order-admin), this is a CREATE, not an UPDATE.
// The parent order is NOT mutated; a separate orders row is inserted with
// `is_rectification = true`, `status = 'delivered'`, `parent_order_id`
// linking back, plus a batch of order_items snapshotting the storno
// quantities at the parent's frozen unit prices.
//
// Pipeline:
//   1. Method check (POST). Body: { parent_order_id, items_to_storno[], reason? }.
//   2. Parse + validate body (shape only; per-item membership and
//      quantity-bound checks live inside the RPC).
//   3. Validate Supabase user JWT (Authorization: Bearer ...).
//   4. Pre-fetch the parent order via service_role to read tenant_id. If
//      missing → 404 PARENT_ORDER_NOT_FOUND (so membership check has
//      something concrete to check against).
//   5. Membership check via supabaseUser.rpc("get_my_tenant_ids"). If
//      parent's tenant_id is not in the list → 403 FORBIDDEN.
//   6. Rate limit per (user, parent_order) at 30 req/min.
//   7. Invoke RPC rectify_order_atomic. The RPC enforces every business
//      invariant (parent is not itself a rectification, parent is in a
//      rectifiable state, each storno item belongs to the parent, qty ≤
//      original) and writes both the rectification order and its items
//      atomically.
//   8. Map the RPC's prefixed RAISE messages to HTTP responses.
//   9. Reply 201 Created with { rectification_order_id, parent_order_id,
//      total_amount, items_count, created_at }.
//
// See docs/orders-architecture.md v1.2 §9.2 (rectification model), §14.

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
const MAX_STORNO_ITEMS = 50;
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

interface StornoItem {
    order_item_id: string;
    quantity: number;
}

interface RectifyOrderRequestBody {
    parent_order_id: string;
    items_to_storno: StornoItem[];
    reason: string | null;
}

interface ParentOrderRow {
    id: string;
    tenant_id: string;
}

interface RpcSuccessPayload {
    rectification_order_id: string;
    parent_order_id: string;
    total_amount: number;
    items_count: number;
    created_at: string;
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
): RectifyOrderRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    if (!_isUuid(obj.parent_order_id)) {
        return { error: "`parent_order_id` must be a UUID." };
    }

    if (!Array.isArray(obj.items_to_storno) || obj.items_to_storno.length === 0) {
        return { error: "`items_to_storno` must be a non-empty array." };
    }
    if (obj.items_to_storno.length > MAX_STORNO_ITEMS) {
        return {
            error: `\`items_to_storno\` must contain at most ${MAX_STORNO_ITEMS} items.`
        };
    }

    const items: StornoItem[] = [];
    for (let i = 0; i < obj.items_to_storno.length; i++) {
        const it = obj.items_to_storno[i];
        if (!it || typeof it !== "object") {
            return { error: `items_to_storno[${i}] must be an object.` };
        }
        const itObj = it as Record<string, unknown>;
        if (!_isUuid(itObj.order_item_id)) {
            return { error: `items_to_storno[${i}].order_item_id must be a UUID.` };
        }
        if (
            typeof itObj.quantity !== "number" ||
            !Number.isInteger(itObj.quantity) ||
            itObj.quantity <= 0
        ) {
            return {
                error: `items_to_storno[${i}].quantity must be a positive integer.`
            };
        }
        items.push({
            order_item_id: itObj.order_item_id as string,
            quantity: itObj.quantity as number
        });
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
        parent_order_id: obj.parent_order_id as string,
        items_to_storno: items,
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

async function _fetchParentOrder(
    supabase: SupabaseClient,
    parentOrderId: string
): Promise<
    | { kind: "ok"; row: ParentOrderRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("orders")
        .select("id, tenant_id")
        .eq("id", parentOrderId)
        .maybeSingle();
    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };
    return { kind: "ok", row: data as ParentOrderRow };
}

function _mapRpcError(rpcError: { code?: string; message?: string }): Response {
    const errMsg = rpcError.message ?? "";

    if (errMsg.startsWith("INVALID_PARAMS:")) {
        // Caller (this Edge Function) should have validated upstream.
        // Surface as 500 since the contract was violated by us.
        console.error("[rectify-order] RPC INVALID_PARAMS:", errMsg);
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
    if (errMsg === "PARENT_ORDER_NOT_FOUND") {
        // Race: parent was deleted between pre-fetch and RPC. Rare but
        // technically possible.
        return jsonResponse(404, {
            code: "PARENT_ORDER_NOT_FOUND",
            message: "Ordine genitore non trovato."
        });
    }
    if (errMsg.startsWith("INVALID_PARENT:")) {
        return jsonResponse(422, {
            code: "INVALID_PARENT",
            message: "Impossibile rettificare un ordine di rettifica."
        });
    }
    if (errMsg.startsWith("INVALID_PARENT_STATE:")) {
        // "INVALID_PARENT_STATE: parent order must be acknowledged or delivered, got submitted"
        const match = errMsg.match(/got (\w+)/);
        const currentStatus = match ? match[1] : null;
        return jsonResponse(422, {
            code: "INVALID_PARENT_STATE",
            message: "Ordine non in stato rettificabile.",
            details: { current_status: currentStatus, raw: errMsg }
        });
    }
    if (errMsg.startsWith("INVALID_STORNO_ITEM:")) {
        return jsonResponse(422, {
            code: "INVALID_ITEMS",
            message: "Riga di storno malformata.",
            details: { reason: "INVALID_STORNO_ITEM", raw: errMsg }
        });
    }
    if (errMsg.startsWith("ORDER_ITEM_NOT_FOUND:")) {
        return jsonResponse(422, {
            code: "INVALID_ITEMS",
            message: "Una delle righe di storno non appartiene all'ordine genitore.",
            details: { reason: "ORDER_ITEM_NOT_FOUND", raw: errMsg }
        });
    }
    if (errMsg.startsWith("STORNO_QTY_EXCEEDS_ORIGINAL:")) {
        return jsonResponse(422, {
            code: "INVALID_ITEMS",
            message: "Quantità di storno superiore alla quantità originale.",
            details: { reason: "STORNO_QTY_EXCEEDS_ORIGINAL", raw: errMsg }
        });
    }
    console.error("[rectify-order] RPC unexpected error:", errMsg);
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
    const body = parsed as RectifyOrderRequestBody;

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
        // ── Pre-fetch parent order (to derive tenant for membership check) ──
        const parentFetch = await _fetchParentOrder(supabaseService, body.parent_order_id);
        if (parentFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "PARENT_ORDER_NOT_FOUND",
                message: "Ordine genitore non trovato."
            });
        }
        if (parentFetch.kind === "db_error") {
            console.error("[rectify-order] parent read error:", parentFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const parentTenantId = parentFetch.row.tenant_id;

        // ── Membership check ──
        const membership = await _isMemberOfTenant(supabaseUser, parentTenantId);
        if (membership.kind === "db_error") {
            console.error(
                "[rectify-order] tenant membership read error:",
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

        // ── Rate limit per (user, parent_order) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `rectify-order:user:${userId}:order:${body.parent_order_id}`,
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
            "rectify_order_atomic",
            {
                p_parent_order_id: body.parent_order_id,
                p_items_to_storno: body.items_to_storno,
                p_notes: body.reason
            }
        );

        if (rpcError) {
            return _mapRpcError(rpcError as { code?: string; message?: string });
        }
        if (!rpcData || typeof rpcData !== "object") {
            console.error("[rectify-order] RPC returned no payload");
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const payload = rpcData as RpcSuccessPayload;

        console.log("[rectify-order] order_rectified", {
            event: "order_rectified",
            user_id: userId,
            tenant_id: parentTenantId,
            parent_order_id: payload.parent_order_id,
            rectification_order_id: payload.rectification_order_id,
            total_amount: payload.total_amount,
            items_count: payload.items_count
        });

        return jsonResponse(201, {
            rectification_order_id: payload.rectification_order_id,
            parent_order_id: payload.parent_order_id,
            total_amount: payload.total_amount,
            items_count: payload.items_count,
            created_at: payload.created_at
        });
    } catch (e) {
        console.error(
            "[rectify-order] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
