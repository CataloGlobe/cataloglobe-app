// @ts-nocheck
//
// submit-order — guest-facing endpoint that registers an order from a table.
//
// Pipeline:
//   1. Parse + shape-validate the request body (items, notes, target_group_id).
//   2. Verify the customer JWT (Authorization: Bearer ...) via verifyCustomerJwt.
//   3. Rate-limit on customer_session_id (10 req/min). Fail-closed on DB errors.
//   4. Pre-fetch the customer_sessions row to discriminate 404 (not found) vs
//      409 (expired). The validateAndSnapshotOrderItems helper called below
//      also touches the session, but it returns a single SESSION_INVALID code
//      whose message we don't want to string-match against.
//   5. validateAndSnapshotOrderItems (shared) — re-derives tenant_id /
//      activity_id / table_id / customer_name / resolved_schedule_id from the
//      session, resolves the active catalog + price overrides, checks
//      availability overrides, validates option selections and recomputes
//      every unit price + line total server-side. Returns the snapshot rows
//      ready to be inserted by the RPC.
//   6. Invoke RPC submit_order_atomic (SECURITY DEFINER, service_role only)
//      which performs the 4 writes in a single PL/pgSQL transaction:
//      order_groups (lazy create or reuse) → orders → order_items batch →
//      customer_sessions.last_activity_at. The RPC owns the target_group_id
//      fusion logic; this Edge Function only forwards the parameter and maps
//      'GROUP_CONFLICT: ...' raises to a 409 response.
//   7. Reply 201 with order_id / order_group_id / status / total_amount /
//      items (snapshot rows from step 5) / created_at.
//
// Trust boundary: tenant_id, activity_id, table_id, customer_name_snapshot
// and resolved_schedule_id are NEVER read from the request body. They are
// rederived from the customer_sessions row looked up via the JWT-validated
// customer_session_id. Only items, notes and target_group_id are accepted
// from the client.
//
// See docs/orders-architecture.md v1.2 §6 (order submit lifecycle) and §7
// (order_groups lifecycle).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCustomerJwt } from "../_shared/customerJwt.ts";
import { checkRateLimit, RateLimitExceededError, extractClientIp, hashIp } from "../_shared/rateLimit.ts";
import {
    validateAndSnapshotOrderItems,
    ValidateOrderItemsError,
    type RequestedOrderItem,
    type ValidatedOrder
} from "../_shared/validateOrderItems.ts";
import { OrderCapError } from "../_shared/orderCaps.ts";
import {
    checkOrderingState,
    orderingStateMessage
} from "../_shared/checkOrderingState.ts";
import { isActivityOpen, nowInRomeParts } from "../_shared/openingHours.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate-limit configuration. 10 submits / minute per customer_session is well
// above any human ordering pace and bounds abuse to one session at a time.
const RATE_LIMIT_PER_SESSION_PER_MIN = 10;

// Table-scoped counter: catches abuse spread across multiple sessions at the
// same physical table (e.g. rotating device_id / re-scanning to reset the
// session-scoped counter).
const RATE_LIMIT_PER_TABLE_PER_MIN = 15;

// IP-scoped counter: catches abuse spread across multiple tables/sessions
// from the same origin.
const RATE_LIMIT_PER_IP_PER_MIN = 20;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Note length limits — mirrored client-side (OrderingSheet) and DB-side
// (CHECK constraints in 20260526180000_orders_notes_length_check.sql).
const ORDER_NOTES_MAX_LEN = 300;
const ITEM_NOTES_MAX_LEN = 140;

/**
 * Trim + collapse multi-whitespace. Return null on empty result. Throws
 * SanitizeNoteTooLong if the trimmed string exceeds `maxLen` characters.
 */
class SanitizeNoteTooLong extends Error {
    constructor(public readonly maxLen: number) {
        super(`Note too long: max ${maxLen} characters.`);
    }
}

function sanitizeNote(raw: unknown, maxLen: number): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLen) {
        throw new SanitizeNoteTooLong(maxLen);
    }
    return trimmed;
}

// ============================================================
// Request body types
// ============================================================

interface SubmitOrderRequestBody {
    items: RequestedOrderItem[];
    notes: string | null;
    target_group_id: string | null;
    idempotency_key: string | null;
}

interface CustomerSessionLookupRow {
    id: string;
    expires_at: string;
    tenant_id: string;
    activity_id: string;
    current_table_id: string | null;
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

function _parseAndValidateBody(raw: unknown): SubmitOrderRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    // items
    if (!Array.isArray(obj.items) || obj.items.length === 0) {
        return { error: "`items` must be a non-empty array." };
    }
    const items: RequestedOrderItem[] = [];
    for (let i = 0; i < obj.items.length; i++) {
        const it = obj.items[i];
        if (!it || typeof it !== "object") {
            return { error: `items[${i}] must be an object.` };
        }
        const itObj = it as Record<string, unknown>;

        if (!_isUuid(itObj.product_id)) {
            return { error: `items[${i}].product_id must be a UUID.` };
        }
        if (
            typeof itObj.quantity !== "number" ||
            !Number.isInteger(itObj.quantity) ||
            itObj.quantity <= 0
        ) {
            return { error: `items[${i}].quantity must be a positive integer.` };
        }
        const requested: RequestedOrderItem = {
            product_id: itObj.product_id as string,
            quantity: itObj.quantity as number
        };

        if (
            itObj.primary_option_value_id !== undefined &&
            itObj.primary_option_value_id !== null
        ) {
            if (!_isUuid(itObj.primary_option_value_id)) {
                return {
                    error: `items[${i}].primary_option_value_id must be a UUID or null.`
                };
            }
            requested.primary_option_value_id = itObj.primary_option_value_id as string;
        }

        if (
            itObj.addon_value_ids !== undefined &&
            itObj.addon_value_ids !== null
        ) {
            if (!Array.isArray(itObj.addon_value_ids)) {
                return {
                    error: `items[${i}].addon_value_ids must be an array of UUIDs.`
                };
            }
            const addons: string[] = [];
            for (let j = 0; j < itObj.addon_value_ids.length; j++) {
                const aid = itObj.addon_value_ids[j];
                if (!_isUuid(aid)) {
                    return {
                        error: `items[${i}].addon_value_ids[${j}] must be a UUID.`
                    };
                }
                addons.push(aid as string);
            }
            requested.addon_value_ids = addons;
        }

        if (itObj.item_notes !== undefined && itObj.item_notes !== null) {
            if (typeof itObj.item_notes !== "string") {
                return { error: `items[${i}].item_notes must be a string or null.` };
            }
            try {
                const sanitized = sanitizeNote(itObj.item_notes, ITEM_NOTES_MAX_LEN);
                if (sanitized !== null) {
                    requested.item_notes = sanitized;
                }
            } catch (e) {
                if (e instanceof SanitizeNoteTooLong) {
                    return {
                        error: `items[${i}].item_notes too long (max ${ITEM_NOTES_MAX_LEN} characters).`
                    };
                }
                throw e;
            }
        }

        items.push(requested);
    }

    // notes
    let notes: string | null = null;
    if (obj.notes !== undefined && obj.notes !== null) {
        if (typeof obj.notes !== "string") {
            return { error: "`notes` must be a string or null." };
        }
        try {
            notes = sanitizeNote(obj.notes, ORDER_NOTES_MAX_LEN);
        } catch (e) {
            if (e instanceof SanitizeNoteTooLong) {
                return {
                    error: `\`notes\` too long (max ${ORDER_NOTES_MAX_LEN} characters).`
                };
            }
            throw e;
        }
    }

    // target_group_id
    let targetGroupId: string | null = null;
    if (obj.target_group_id !== undefined && obj.target_group_id !== null) {
        if (!_isUuid(obj.target_group_id)) {
            return { error: "`target_group_id` must be a UUID or null." };
        }
        targetGroupId = obj.target_group_id as string;
    }

    // idempotency_key (optional; body field takes precedence, header fallback
    // is applied by the caller after this parse — see handler below)
    let idempotencyKey: string | null = null;
    if (obj.idempotency_key !== undefined && obj.idempotency_key !== null) {
        if (typeof obj.idempotency_key !== "string" || obj.idempotency_key.trim().length === 0) {
            return { error: "`idempotency_key` must be a non-empty string or null." };
        }
        if (obj.idempotency_key.length > 200) {
            return { error: "`idempotency_key` too long (max 200 characters)." };
        }
        idempotencyKey = obj.idempotency_key;
    }

    return { items, notes, target_group_id: targetGroupId, idempotency_key: idempotencyKey };
}

async function _fetchSessionForDiagnostics(
    supabase: SupabaseClient,
    customerSessionId: string
): Promise<
    | {
          kind: "ok";
          expiresAt: string;
          tenantId: string;
          activityId: string;
          tableId: string | null;
      }
    | { kind: "not_found" }
    | { kind: "expired" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("id, expires_at, tenant_id, activity_id, current_table_id")
        .eq("id", customerSessionId)
        .maybeSingle();

    if (error) {
        return { kind: "db_error", message: error.message };
    }
    if (!data) {
        return { kind: "not_found" };
    }
    const row = data as CustomerSessionLookupRow;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        return { kind: "expired" };
    }
    return {
        kind: "ok",
        expiresAt: row.expires_at,
        tenantId: row.tenant_id,
        activityId: row.activity_id,
        tableId: row.current_table_id
    };
}

interface RpcSuccessPayload {
    order_id: string;
    order_group_id: string;
    status: string;
    created_at: string;
    // Present + true only when submit_order_atomic short-circuited on a
    // previously-seen idempotency key (network retry of the same submit).
    // On a replay the RPC does NOT re-return total_amount/items — the caller
    // must reuse the already-validated snapshot from THIS request.
    idempotent_replay?: boolean;
}

async function _invokeSubmitOrderAtomic(
    supabase: SupabaseClient,
    validated: ValidatedOrder,
    targetGroupId: string | null,
    idempotencyKey: string | null
): Promise<
    | { kind: "ok"; payload: RpcSuccessPayload }
    | { kind: "group_conflict"; message: string }
    | { kind: "invalid_params"; message: string }
    | { kind: "idempotency_in_progress"; message: string }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase.rpc("submit_order_atomic", {
        p_tenant_id: validated.tenant_id,
        p_activity_id: validated.activity_id,
        p_table_id: validated.table_id,
        p_customer_session_id: validated.customer_session_id,
        p_customer_name_snapshot: validated.customer_name_snapshot,
        p_resolved_schedule_id: validated.resolved_schedule_id,
        p_total_amount: validated.total_amount,
        p_notes: validated.notes,
        p_items: validated.items,
        p_target_group_id: targetGroupId,
        p_idempotency_key: idempotencyKey
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.startsWith("GROUP_CONFLICT:")) {
            return { kind: "group_conflict", message: msg.replace(/^GROUP_CONFLICT:\s*/, "") };
        }
        if (msg.startsWith("INVALID_PARAMS:")) {
            return { kind: "invalid_params", message: msg.replace(/^INVALID_PARAMS:\s*/, "") };
        }
        if (msg.startsWith("IDEMPOTENCY_IN_PROGRESS:")) {
            return {
                kind: "idempotency_in_progress",
                message: msg.replace(/^IDEMPOTENCY_IN_PROGRESS:\s*/, "")
            };
        }
        return { kind: "db_error", message: msg };
    }

    if (!data || typeof data !== "object") {
        return { kind: "db_error", message: "RPC returned no payload." };
    }
    return { kind: "ok", payload: data as RpcSuccessPayload };
}

function _buildItemsResponse(items: ValidatedOrder["items"]): Array<Record<string, unknown>> {
    return items.map(it => ({
        id: null,
        product_id: it.product_id,
        product_name_snapshot: it.product_name_snapshot,
        unit_price_snapshot: it.unit_price_snapshot,
        quantity: it.quantity,
        line_total: it.line_total,
        options_snapshot: it.options_snapshot,
        item_notes: it.item_notes
    }));
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
    const body = parsed as SubmitOrderRequestBody;

    // ── Idempotency key: body field `idempotency_key` takes precedence,
    // `Idempotency-Key` HTTP header is the fallback. Optional — null keeps
    // the pre-Fase-2 behaviour (no dedup). ──
    const idempotencyHeader = req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key");
    const idempotencyKey =
        body.idempotency_key ?? (idempotencyHeader && idempotencyHeader.trim().length > 0 ? idempotencyHeader.trim() : null);

    // ── JWT verify ──
    const authHeader = req.headers.get("Authorization") ?? req.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: "Authorization header mancante o malformato."
        });
    }
    const jwt = authHeader.slice(7).trim();

    let claims;
    try {
        claims = await verifyCustomerJwt(jwt);
    } catch (e) {
        return jsonResponse(401, {
            code: "UNAUTHORIZED",
            message: (e as Error)?.message ?? "JWT non valido."
        });
    }
    const customerSessionId = claims.customer_session_id;

    // ── Build service-role client ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // Run a rate-limit check and, on RateLimitExceededError, return the
        // shared 429 response. Any other error (fail-closed DB failure) is
        // rethrown to the outer catch → 500. Returns null when under limit.
        const enforceRateLimit = async (
            key: string,
            limit: number
        ): Promise<Response | null> => {
            try {
                await checkRateLimit(supabase, { key, limit, windowSeconds: 60 });
                return null;
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
        };

        // ── Rate limit (per customer_session + per IP) ──
        // Cheap fast-fail BEFORE the diagnostics DB read: these two counters
        // need no table_id, so a flood of requests with a valid JWT is
        // short-circuited without one SELECT each. Fail-closed on DB errors.
        const ipHash = await hashIp(extractClientIp(req));
        const sessionLimited = await enforceRateLimit(
            `submit-order:session:${customerSessionId}`,
            RATE_LIMIT_PER_SESSION_PER_MIN
        );
        if (sessionLimited) return sessionLimited;
        const ipLimited = await enforceRateLimit(
            `submit-order:ip:${ipHash}`,
            RATE_LIMIT_PER_IP_PER_MIN
        );
        if (ipLimited) return ipLimited;

        // ── Pre-fetch session for 404 vs 409 disambiguation ──
        const diag = await _fetchSessionForDiagnostics(supabase, customerSessionId);
        if (diag.kind === "not_found") {
            return jsonResponse(404, {
                code: "SESSION_NOT_FOUND",
                message: "Sessione cliente non trovata."
            });
        }
        if (diag.kind === "expired") {
            return jsonResponse(409, {
                code: "SESSION_EXPIRED",
                message: "Sessione cliente scaduta."
            });
        }
        if (diag.kind === "db_error") {
            console.error("[submit-order] session lookup failed:", diag.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Rate limit (per table) ──
        // Table id is always set for a live ordering session; the guard
        // avoids a shared null bucket in the degenerate case. Same 429 map.
        if (diag.tableId) {
            const tableLimited = await enforceRateLimit(
                `submit-order:table:${diag.tableId}`,
                RATE_LIMIT_PER_TABLE_PER_MIN
            );
            if (tableLimited) return tableLimited;
        }

        // ── Ordering state check (tenant + activity + table) ──
        // Intercept maintenance mode mid-session: cliente con session valida
        // ma tenant scaduto / activity inactive / ordering_enabled=false /
        // table.maintenance_mode=true → 423 ORDERING_UNAVAILABLE con reason.
        // Feature-not-available (piano senza table_ordering) → 423
        // FEATURE_NOT_AVAILABLE: surface a clean codified error before the
        // BEFORE INSERT trigger on orders would raise it.
        const state = await checkOrderingState(supabase, {
            tenantId: diag.tenantId,
            activityId: diag.activityId,
            tableId: diag.tableId
        });
        if (!state.ok) {
            if (state.reason === "feature_not_available") {
                return jsonResponse(423, {
                    code: "FEATURE_NOT_AVAILABLE",
                    message: "Gli ordini al tavolo non sono disponibili per questa attivita'."
                });
            }
            return jsonResponse(423, {
                code: "ORDERING_UNAVAILABLE",
                reason: state.reason,
                message: orderingStateMessage(state.reason)
            });
        }

        // ── Opening-hours gate (submit only; menu stays consultable via resolve-table) ──
        // Fail-OPEN on error: this is UX, not a security boundary. This is the ONLY
        // control permitted to fail open; every other guard fails closed.
        try {
            const [{ data: hoursRows }, { data: closureRows }] = await Promise.all([
                supabase.from("activity_hours")
                    .select("day_of_week, opens_at, closes_at, closes_next_day, is_closed, slot_index")
                    .eq("activity_id", diag.activityId),
                supabase.from("activity_closures")
                    .select("closure_date, end_date, is_closed, slots")
                    .eq("activity_id", diag.activityId)
            ]);
            const open = isActivityOpen(nowInRomeParts(new Date()), hoursRows ?? [], closureRows ?? []);
            if (!open) {
                return jsonResponse(423, {
                    code: "ORDERING_CLOSED",
                    message: "Il locale è chiuso in questo momento. Le ordinazioni riapriranno negli orari di apertura."
                });
            }
        } catch (e) {
            console.error("[submit-order] opening-hours check failed, failing open:", e);
        }

        // ── Validate + snapshot items ──
        // The shared validator re-fetches the session and re-derives every
        // sensitive field server-side. The pre-fetch above only served to
        // discriminate 404 vs 409; from here on the validator is the source
        // of truth for tenant_id / activity_id / table_id / pricing.
        let validated: ValidatedOrder;
        try {
            validated = await validateAndSnapshotOrderItems(
                supabase,
                customerSessionId,
                body.items,
                body.notes ?? undefined
            );
        } catch (e) {
            if (e instanceof OrderCapError) {
                return jsonResponse(422, { code: e.code, message: e.message });
            }
            if (e instanceof ValidateOrderItemsError) {
                // SESSION_INVALID at this point would mean a race between the
                // pre-fetch and the validator (session deleted in between).
                // Map it to 409 SESSION_EXPIRED — closest semantic match for
                // the guest UX ("your session is no longer valid, rescan").
                if (e.code === "SESSION_INVALID") {
                    return jsonResponse(409, {
                        code: "SESSION_EXPIRED",
                        message: e.message
                    });
                }
                return jsonResponse(422, {
                    code: "INVALID_ITEMS",
                    message: e.message,
                    details: { reason: e.code, ...(e.details ?? {}) }
                });
            }
            throw e;
        }

        // ── Invoke RPC submit_order_atomic ──
        const rpc = await _invokeSubmitOrderAtomic(
            supabase,
            validated,
            body.target_group_id,
            idempotencyKey
        );

        if (rpc.kind === "group_conflict") {
            return jsonResponse(409, {
                code: "GROUP_CONFLICT",
                message: rpc.message
            });
        }
        if (rpc.kind === "idempotency_in_progress") {
            // Concurrent retry of the SAME idempotency key raced us: the
            // first attempt claimed the row but hasn't backfilled order_id
            // yet. Fail-closed — surface 409, never let a duplicate through.
            return jsonResponse(409, {
                code: "IDEMPOTENCY_IN_PROGRESS",
                message: "Ordine già in elaborazione, attendi qualche istante."
            });
        }
        if (rpc.kind === "invalid_params") {
            // Should not happen — validator runs upstream. Treat as a server
            // bug, log loudly, surface 500 to the client.
            console.error(
                "[submit-order] RPC INVALID_PARAMS (server bug):",
                rpc.message,
                { customerSessionId }
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (rpc.kind === "db_error") {
            console.error("[submit-order] RPC error:", rpc.message, { customerSessionId });
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Invalidate any pending "bill request" on the table ──
        // Submitting a new order implies the table is no longer "ready to
        // pay". Clear bill_requested_at on every active session at the same
        // table so the customer pill disappears and the admin badge updates
        // via realtime (customer_sessions is in supabase_realtime). Scoped
        // to (current_table_id, tenant_id) defense-in-depth, restricted to
        // sessions still active and already flagged. Idempotent and
        // non-blocking: errors are logged, the order remains committed.
        if (validated.table_id) {
            const nowIso = new Date().toISOString();
            const { data: cleared, error: clearErr } = await supabase
                .from("customer_sessions")
                .update({ bill_requested_at: null })
                .eq("current_table_id", validated.table_id)
                .eq("tenant_id", validated.tenant_id)
                .gt("expires_at", nowIso)
                .not("bill_requested_at", "is", null)
                .select("id");
            if (clearErr) {
                console.error(
                    "[submit-order] bill_requested_at clear failed:",
                    clearErr.message,
                    { customerSessionId, table_id: validated.table_id }
                );
            } else if (cleared && cleared.length > 0) {
                console.log("[submit-order] bill_requested_cleared", {
                    event: "bill_requested_cleared",
                    customer_session_id: customerSessionId,
                    table_id: validated.table_id,
                    cleared_sessions_count: cleared.length
                });
            }
        }

        // ── Success ──
        // On idempotent_replay the RPC short-circuited on a previously-seen
        // idempotency key and did NOT insert a new order — order_id/
        // order_group_id/created_at come from the FIRST successful attempt.
        // total_amount/items are NOT re-returned by the RPC on replay; we
        // reuse `validated.total_amount` / `validated.items` from THIS
        // request, which re-validated the same cart content server-side
        // (validateAndSnapshotOrderItems), so the response stays well-formed.
        console.log(
            rpc.payload.idempotent_replay ? "[submit-order] order_submit_replay" : "[submit-order] order_submitted",
            {
                event: rpc.payload.idempotent_replay ? "order_submit_replay" : "order_submitted",
                customer_session_id: customerSessionId,
                order_id: rpc.payload.order_id,
                order_group_id: rpc.payload.order_group_id,
                item_count: validated.items.length,
                total_amount: validated.total_amount
            }
        );

        // total_amount/items are re-derived from THIS request's validated snapshot
        // (the RPC replay payload omits them) → 201 body well-formed for fresh + replay.
        return jsonResponse(201, {
            order_id: rpc.payload.order_id,
            order_group_id: rpc.payload.order_group_id,
            status: rpc.payload.status,
            total_amount: validated.total_amount,
            items: _buildItemsResponse(validated.items),
            created_at: rpc.payload.created_at
        });
    } catch (e) {
        console.error(
            "[submit-order] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
