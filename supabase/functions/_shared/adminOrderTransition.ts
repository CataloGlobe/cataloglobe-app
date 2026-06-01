// @ts-nocheck
//
// Shared pipeline for admin-side order state transitions.
//
// Encapsulates the structural pattern shared by acknowledge-order,
// deliver-order and cancel-order-admin:
//   1. CORS preflight / method check / body parse.
//   2. Validate Supabase user JWT (Authorization: Bearer ...).
//   3. Membership check: the JWT'd user must belong to the order's tenant
//      (verified by calling get_my_tenant_ids() with the user's own JWT
//      so that RLS + JWT claims are the source of truth).
//   4. Rate limit per (user, order).
//   5. Read-then-update with optimistic locking:
//      - SELECT current order (status, version)
//      - UPDATE WHERE status = expected_source AND version = expected_version
//      - On 0 rows: re-read and discriminate 409 INVALID_STATE_TRANSITION
//        between "wrong state" and "OPTIMISTIC_LOCK_CONFLICT".
//   6. Strict no-PII logging on success + on error.
//
// Concrete transitions configure the helper via TransitionConfig, keeping
// the per-endpoint index.ts files thin wrappers around this function.
//
// See docs/orders-architecture.md v1.2 §8 (state transitions), §14 (Edge
// Function contracts).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "./rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_USER_PER_ORDER_PER_MIN = 30;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Public types
// ============================================================

export interface TransitionConfig {
    /**
     * Endpoint identifier, used in logs and as the rate-limit key prefix.
     */
    function_name: string;
    /**
     * Single status or list of statuses the order must currently be in.
     * cancel-order-admin uses ["submitted","acknowledged"]; others a single.
     */
    source_status: string | string[];
    /**
     * Status to assign on success.
     */
    target_status: string;
    /**
     * Timestamp column to set to now() on success
     * (e.g. "acknowledged_at", "delivered_at", "cancelled_at").
     * Optional: pass null when the transition has no dedicated timestamp
     * (e.g. restore-order, which only resets fields and bumps version).
     * `updated_at` is always set regardless of this value.
     */
    timestamp_field?: string | null;
    /**
     * Optional: columns to SET = NULL on success. Used by reversal-like
     * transitions to clear timestamps tied to the previous state
     * (e.g. restore-order clears delivered_at + ready_at when going back
     * from delivered to acknowledged).
     */
    clear_fields?: string[];
    /**
     * Optional: parse + validate endpoint-specific body fields beyond
     * order_id + expected_version. Return either the parsed extras object
     * or { error: <string> } for a 400 INVALID_REQUEST response.
     */
    parse_extra_body?: (raw: Record<string, unknown>) => Record<string, unknown> | { error: string };
    /**
     * Optional: extra SET fields for the UPDATE, computed from the parsed
     * body extras. cancel-order-admin uses this for cancelled_by +
     * cancellation_reason.
     */
    build_extra_update_fields?: (extras: Record<string, unknown>) => Record<string, unknown>;
    /**
     * Optional: extra fields to include in the success response, computed
     * from the updated row and the body extras.
     */
    build_extra_response_fields?: (
        updated: UpdatedOrderRow,
        extras: Record<string, unknown>
    ) => Record<string, unknown>;
    /**
     * Columns to return from the UPDATE … RETURNING clause beyond the
     * defaults (id, status, version + timestamp_field). cancel-order-admin
     * adds "cancellation_reason".
     */
    extra_returning_columns?: string[];
}

// ============================================================
// Internal types
// ============================================================

interface BaseRequestBody {
    order_id: string;
    expected_version: number;
}

interface OrderRow {
    id: string;
    tenant_id: string;
    status: string;
    version: number;
    customer_session_id: string;
}

export interface UpdatedOrderRow {
    id: string;
    status: string;
    version: number;
    [key: string]: unknown;
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

function _parseBaseBody(raw: unknown): BaseRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;
    if (!_isUuid(obj.order_id)) {
        return { error: "`order_id` must be a UUID." };
    }
    if (
        typeof obj.expected_version !== "number" ||
        !Number.isInteger(obj.expected_version) ||
        obj.expected_version < 1
    ) {
        return { error: "`expected_version` must be a positive integer." };
    }
    return {
        order_id: obj.order_id as string,
        expected_version: obj.expected_version as number
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
    // Build a user-scoped client so that subsequent RPCs run with the
    // user's JWT (RLS sees the authenticated user, not service_role).
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
    if (error) {
        return { kind: "db_error", message: error.message };
    }
    // RPC returns SETOF uuid → supabase-js delivers an array of { get_my_tenant_ids: uuid }
    // or an array of strings depending on the version. Normalize both shapes.
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
        .select("id, tenant_id, status, version, customer_session_id")
        .eq("id", orderId)
        .maybeSingle();

    if (error) {
        return { kind: "db_error", message: error.message };
    }
    if (!data) {
        return { kind: "not_found" };
    }
    return { kind: "ok", row: data as OrderRow };
}

async function _tryTransition(
    supabase: SupabaseClient,
    orderId: string,
    expectedVersion: number,
    sourceStatuses: string[],
    setPayload: Record<string, unknown>,
    returningColumns: string[]
): Promise<
    | { kind: "ok"; row: UpdatedOrderRow }
    | { kind: "no_match" }
    | { kind: "db_error"; message: string }
> {
    let query = supabase
        .from("orders")
        .update(setPayload)
        .eq("id", orderId)
        .eq("version", expectedVersion);

    if (sourceStatuses.length === 1) {
        query = query.eq("status", sourceStatuses[0]);
    } else {
        query = query.in("status", sourceStatuses);
    }

    const { data, error } = await query
        .select(returningColumns.join(", "))
        .maybeSingle();

    if (error) {
        return { kind: "db_error", message: error.message };
    }
    if (!data) {
        return { kind: "no_match" };
    }
    return { kind: "ok", row: data as UpdatedOrderRow };
}

// ============================================================
// Public entry point
// ============================================================

export async function performAdminOrderTransition(
    req: Request,
    config: TransitionConfig
): Promise<Response> {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
        return jsonResponse(405, {
            code: "METHOD_NOT_ALLOWED",
            message: "Metodo non consentito."
        });
    }

    // ── Parse body (base + extras) ──
    let rawBody: unknown;
    try {
        rawBody = await req.json();
    } catch {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "Body JSON malformato."
        });
    }
    const baseParsed = _parseBaseBody(rawBody);
    if ("error" in baseParsed) {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: baseParsed.error
        });
    }
    const { order_id: orderId, expected_version: expectedVersion } = baseParsed as BaseRequestBody;

    let extras: Record<string, unknown> = {};
    if (config.parse_extra_body) {
        const extrasParsed = config.parse_extra_body(rawBody as Record<string, unknown>);
        if ("error" in extrasParsed) {
            return jsonResponse(400, {
                code: "INVALID_REQUEST",
                message: extrasParsed.error as string
            });
        }
        extras = extrasParsed as Record<string, unknown>;
    }

    // ── Extract + validate JWT user ──
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

    // ── Build service-role client (for UPDATEs that bypass RLS) ──
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Rate limit per (user, order) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `${config.function_name}:user:${userId}:order:${orderId}`,
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

        // ── Fetch order (404 / 403 / 409 source discrimination) ──
        const fetched = await _fetchOrder(supabaseService, orderId);
        if (fetched.kind === "not_found") {
            return jsonResponse(404, {
                code: "ORDER_NOT_FOUND",
                message: "Ordine non trovato."
            });
        }
        if (fetched.kind === "db_error") {
            console.error(`[${config.function_name}] order read error:`, fetched.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const order = fetched.row;

        // ── Membership check (user must belong to order's tenant) ──
        const membership = await _isMemberOfTenant(supabaseUser, order.tenant_id);
        if (membership.kind === "db_error") {
            console.error(
                `[${config.function_name}] tenant membership read error:`,
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

        // ── Discriminate state mismatch BEFORE attempting UPDATE ──
        const sourceStatuses = Array.isArray(config.source_status)
            ? config.source_status
            : [config.source_status];

        if (!sourceStatuses.includes(order.status)) {
            return jsonResponse(409, {
                code: "INVALID_STATE_TRANSITION",
                message: `Ordine in stato "${order.status}", non transizionabile a "${config.target_status}".`,
                details: {
                    current_status: order.status,
                    expected_status: sourceStatuses,
                    target_status: config.target_status
                }
            });
        }

        if (order.version !== expectedVersion) {
            return jsonResponse(409, {
                code: "INVALID_STATE_TRANSITION",
                message: "Versione dell'ordine non corrisponde, ricarica e riprova.",
                details: {
                    reason: "OPTIMISTIC_LOCK_CONFLICT",
                    current_version: order.version,
                    expected_version: expectedVersion
                }
            });
        }

        // ── UPDATE with optimistic lock + state guard ──
        const nowIso = new Date().toISOString();
        const setPayload: Record<string, unknown> = {
            status: config.target_status,
            version: order.version + 1,
            updated_at: nowIso,
            ...(config.timestamp_field ? { [config.timestamp_field]: nowIso } : {}),
            ...((config.clear_fields ?? []).reduce<Record<string, unknown>>((acc, col) => {
                acc[col] = null;
                return acc;
            }, {})),
            ...(config.build_extra_update_fields?.(extras) ?? {})
        };

        const baseReturning = ["id", "status", "version"];
        if (config.timestamp_field) baseReturning.push(config.timestamp_field);
        const returningColumns = Array.from(
            new Set([
                ...baseReturning,
                ...(config.clear_fields ?? []),
                ...(config.extra_returning_columns ?? [])
            ])
        );

        const updateResult = await _tryTransition(
            supabaseService,
            orderId,
            expectedVersion,
            sourceStatuses,
            setPayload,
            returningColumns
        );

        if (updateResult.kind === "db_error") {
            console.error(`[${config.function_name}] update error:`, updateResult.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (updateResult.kind === "no_match") {
            // Pre-check passed but UPDATE matched 0 rows → concurrent
            // mutation between SELECT and UPDATE. Surface as a lock
            // conflict so the client retries with a fresh version.
            return jsonResponse(409, {
                code: "INVALID_STATE_TRANSITION",
                message: "Ordine modificato concorrentemente, riprova.",
                details: { reason: "OPTIMISTIC_LOCK_CONFLICT" }
            });
        }
        const updated = updateResult.row;

        // ── Success ──
        console.log(`[${config.function_name}] order_transition`, {
            event: "order_transition",
            function_name: config.function_name,
            user_id: userId,
            tenant_id: order.tenant_id,
            order_id: updated.id,
            source_status: order.status,
            target_status: updated.status,
            new_version: updated.version
        });

        const responseBody: Record<string, unknown> = {
            order_id: updated.id,
            status: updated.status,
            version: updated.version,
            ...(config.timestamp_field
                ? { [config.timestamp_field]: updated[config.timestamp_field] }
                : {}),
            ...((config.clear_fields ?? []).reduce<Record<string, unknown>>((acc, col) => {
                acc[col] = updated[col] ?? null;
                return acc;
            }, {})),
            ...(config.build_extra_response_fields?.(updated, extras) ?? {})
        };

        return jsonResponse(200, responseBody);
    } catch (e) {
        console.error(
            `[${config.function_name}] internal error:`,
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
}
