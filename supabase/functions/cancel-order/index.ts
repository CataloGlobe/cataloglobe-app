// @ts-nocheck
//
// cancel-order — guest-facing endpoint that lets a customer cancel their
// own order, but only while the staff has not yet acknowledged it.
//
// Customer-side cancel rules (docs/orders-architecture.md §8):
//   - Only the customer who submitted the order can cancel it (guard via
//     customer_session_id).
//   - Only orders in `status = 'submitted'` are eligible. Once the staff
//     acknowledges, customer-side cancel is rejected — the customer must
//     ask staff in person (admin-side cancel comes in a later task).
//
// Pipeline:
//   1. Method check (POST). Body: { order_id: uuid }.
//   2. Verify the customer JWT (Authorization: Bearer ...).
//   3. Pre-fetch the customer_sessions row to discriminate 404 (not found)
//      vs 409 (expired).
//   4. Rate-limit on customer_session_id (10 req/min).
//   5. Atomic UPDATE on orders with guards on id + customer_session_id +
//      status='submitted'. RETURNING the updated row.
//   6. If 0 rows affected, run a follow-up SELECT to discriminate:
//      - row missing               → 404 ORDER_NOT_FOUND
//      - row belongs to other session → 403 FORBIDDEN
//      - row owned, wrong status   → 409 INVALID_STATE_TRANSITION
//   7. Reply 200 with { order_id, status, version, cancelled_at }.
//
// No RPC needed: a single UPDATE statement is atomic per Postgres semantics
// and the optimistic-locking version bump is part of the SET clause.
// Customer payload intentionally omits `expected_version` — there is no
// concurrent customer-on-self race; the WHERE status='submitted' guard
// catches the only meaningful race (staff acknowledging concurrently).
//
// See docs/orders-architecture.md v1.2 §8 (state transitions), §14 (Edge
// Function contracts).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyCustomerJwt } from "../_shared/customerJwt.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RATE_LIMIT_PER_SESSION_PER_MIN = 10;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Types
// ============================================================

interface CancelOrderRequestBody {
    order_id: string;
}

interface CustomerSessionLookupRow {
    id: string;
    expires_at: string;
}

interface UpdatedOrderRow {
    id: string;
    status: string;
    version: number;
    cancelled_at: string | null;
}

interface ExistingOrderRow {
    id: string;
    customer_session_id: string;
    status: string;
    version: number;
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

function _parseAndValidateBody(raw: unknown): CancelOrderRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;
    if (!_isUuid(obj.order_id)) {
        return { error: "`order_id` must be a UUID." };
    }
    return { order_id: obj.order_id as string };
}

async function _fetchSessionForDiagnostics(
    supabase: SupabaseClient,
    customerSessionId: string
): Promise<
    | { kind: "ok"; row: CustomerSessionLookupRow }
    | { kind: "not_found" }
    | { kind: "expired" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("id, expires_at")
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
    return { kind: "ok", row };
}

// Cancels an order with read-then-update + optimistic locking (see
// docs/orders-architecture.md §8.3). The pre-fetch SELECT discriminates
// 404 / 403 / 409 cleanly; the UPDATE then commits with a version guard
// so concurrent staff acknowledgements lose to a 409 OPTIMISTIC_LOCK
// rather than silently overwriting their work.
async function _readAndCancelOrder(
    supabase: SupabaseClient,
    orderId: string,
    customerSessionId: string
): Promise<
    | { kind: "ok"; row: UpdatedOrderRow }
    | { kind: "not_found" }
    | { kind: "forbidden" }
    | { kind: "invalid_state"; currentStatus: string }
    | { kind: "lock_conflict" }
    | { kind: "db_error"; message: string }
> {
    // ── Step 1: read current order (auth + state + version) ──
    const { data: current, error: readErr } = await supabase
        .from("orders")
        .select("id, customer_session_id, status, version")
        .eq("id", orderId)
        .maybeSingle();

    if (readErr) {
        return { kind: "db_error", message: `orders read failed: ${readErr.message}` };
    }
    if (!current) {
        return { kind: "not_found" };
    }
    const currentRow = current as ExistingOrderRow;
    if (currentRow.customer_session_id !== customerSessionId) {
        return { kind: "forbidden" };
    }
    if (currentRow.status !== "submitted") {
        return { kind: "invalid_state", currentStatus: currentRow.status };
    }

    // ── Step 2: UPDATE with optimistic lock guard ──
    const nowIso = new Date().toISOString();
    const { data: updated, error: updErr } = await supabase
        .from("orders")
        .update({
            status: "cancelled",
            cancelled_at: nowIso,
            cancelled_by: "customer",
            version: currentRow.version + 1,
            updated_at: nowIso
        })
        .eq("id", orderId)
        .eq("customer_session_id", customerSessionId)
        .eq("status", "submitted")
        .eq("version", currentRow.version)
        .select("id, status, version, cancelled_at")
        .maybeSingle();

    if (updErr) {
        return { kind: "db_error", message: `orders update failed: ${updErr.message}` };
    }
    if (!updated) {
        // Pre-check passed but UPDATE matched 0 rows → someone changed
        // status / version between the SELECT and the UPDATE (most likely
        // staff acknowledging concurrently).
        return { kind: "lock_conflict" };
    }
    return { kind: "ok", row: updated as UpdatedOrderRow };
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
    const { order_id: orderId } = parsed as CancelOrderRequestBody;

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
        // ── Pre-fetch session (404 / 409 discrimination) ──
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
            console.error("[cancel-order] session lookup failed:", diag.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Rate limit ──
        try {
            await checkRateLimit(supabase, {
                key: `cancel-order:session:${customerSessionId}`,
                limit: RATE_LIMIT_PER_SESSION_PER_MIN,
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

        // ── Read-then-update with optimistic locking ──
        const result = await _readAndCancelOrder(supabase, orderId, customerSessionId);

        if (result.kind === "ok") {
            console.log("[cancel-order] order_cancelled", {
                event: "order_cancelled",
                customer_session_id: customerSessionId,
                order_id: result.row.id,
                version: result.row.version
            });
            return jsonResponse(200, {
                order_id: result.row.id,
                status: result.row.status,
                version: result.row.version,
                cancelled_at: result.row.cancelled_at
            });
        }
        if (result.kind === "not_found") {
            return jsonResponse(404, {
                code: "ORDER_NOT_FOUND",
                message: "Ordine non trovato."
            });
        }
        if (result.kind === "forbidden") {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Questo ordine non appartiene alla sessione corrente."
            });
        }
        if (result.kind === "invalid_state") {
            return jsonResponse(409, {
                code: "INVALID_STATE_TRANSITION",
                message:
                    "Ordine già processato dallo staff, non può essere cancellato dal cliente.",
                details: { current_status: result.currentStatus }
            });
        }
        if (result.kind === "lock_conflict") {
            return jsonResponse(409, {
                code: "INVALID_STATE_TRANSITION",
                message: "Ordine modificato concorrentemente, riprova.",
                details: { reason: "OPTIMISTIC_LOCK_CONFLICT" }
            });
        }
        // result.kind === "db_error"
        console.error("[cancel-order] db error:", result.message);
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    } catch (e) {
        console.error(
            "[cancel-order] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
