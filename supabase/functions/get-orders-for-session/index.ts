// @ts-nocheck
//
// get-orders-for-session — guest-facing endpoint that lists every order
// belonging to the currently authenticated customer session.
//
// Use cases:
//   - Guest reopens the web app: rehydrate the "my orders" view.
//   - Guest taps "I miei ordini" tab in the public hub.
//   - Page refresh after a submit-order call.
//
// Pipeline:
//   1. Method check (POST). Empty body acceptable; nothing is read from it.
//   2. Verify the customer JWT (Authorization: Bearer ...).
//   3. Pre-fetch the customer_sessions row to discriminate 404 (not found)
//      vs 409 (expired).
//   4. Rate-limit on customer_session_id (10 req/min). Same key scheme as
//      submit-order to keep the bucket configuration uniform across the
//      epic, but a separate scope prefix.
//   5. Fetch the table row (label + zone) so the response includes
//      identifying info the guest UI needs.
//   6. Fetch the current open order_groups row for the table (if any) so
//      the guest UI can show "you can join the group X" affordance.
//   7. Fetch orders + embedded order_items for the session, newest first.
//   8. Reply 200 with the assembled payload.
//
// Trust boundary: every field is rederived server-side from the
// customer_sessions row looked up via the JWT-validated session id.
// The request body is intentionally ignored.
//
// See docs/orders-architecture.md v1.2.

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

// ============================================================
// Types
// ============================================================

interface CustomerSessionRow {
    id: string;
    tenant_id: string;
    current_table_id: string | null;
    order_group_id: string | null;
    expires_at: string;
}

interface TableRow {
    id: string;
    label: string;
    zone: string | null;
}

interface OrderItemRow {
    id: string;
    product_id: string | null;
    product_name_snapshot: string;
    unit_price_snapshot: number | string;
    quantity: number;
    line_total: number | string;
    options_snapshot: Record<string, unknown>;
    item_notes: string | null;
}

interface OrderRow {
    id: string;
    status: string;
    total_amount: number | string;
    order_group_id: string | null;
    notes: string | null;
    created_at: string;
    items: OrderItemRow[] | null;
}

// ============================================================
// Helpers
// ============================================================

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

function _toNumber(value: number | string): number {
    if (typeof value === "number") return value;
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}

async function _fetchSession(
    supabase: SupabaseClient,
    customerSessionId: string
): Promise<
    | { kind: "ok"; row: CustomerSessionRow }
    | { kind: "not_found" }
    | { kind: "expired" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("customer_sessions")
        .select("id, tenant_id, current_table_id, order_group_id, expires_at")
        .eq("id", customerSessionId)
        .maybeSingle();

    if (error) {
        return { kind: "db_error", message: error.message };
    }
    if (!data) {
        return { kind: "not_found" };
    }
    const row = data as CustomerSessionRow;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
        return { kind: "expired" };
    }
    return { kind: "ok", row };
}

async function _fetchTable(
    supabase: SupabaseClient,
    tableId: string
): Promise<TableRow | null> {
    const { data, error } = await supabase
        .from("tables")
        .select("id, label, zone")
        .eq("id", tableId)
        .maybeSingle();

    if (error) {
        throw new Error(`tables select failed: ${error.message}`);
    }
    return data as TableRow | null;
}

async function _fetchCurrentOpenGroupId(
    supabase: SupabaseClient,
    tableId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("order_groups")
        .select("id")
        .eq("table_id", tableId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw new Error(`order_groups select failed: ${error.message}`);
    }
    return data ? (data as { id: string }).id : null;
}

async function _fetchOrdersWithItems(
    supabase: SupabaseClient,
    customerSessionId: string
): Promise<OrderRow[]> {
    const { data, error } = await supabase
        .from("orders")
        .select(
            `
            id, status, total_amount, order_group_id, notes, created_at,
            items:order_items(
                id, product_id, product_name_snapshot,
                unit_price_snapshot, quantity, line_total,
                options_snapshot, item_notes
            )
            `
        )
        .eq("customer_session_id", customerSessionId)
        .order("created_at", { ascending: false });

    if (error) {
        throw new Error(`orders select failed: ${error.message}`);
    }
    return (data ?? []) as OrderRow[];
}

function _shapeOrders(orders: OrderRow[]): Array<Record<string, unknown>> {
    return orders.map(o => ({
        id: o.id,
        status: o.status,
        total_amount: _toNumber(o.total_amount),
        order_group_id: o.order_group_id,
        notes: o.notes,
        created_at: o.created_at,
        items: (o.items ?? []).map(it => ({
            id: it.id,
            product_id: it.product_id,
            product_name_snapshot: it.product_name_snapshot,
            unit_price_snapshot: _toNumber(it.unit_price_snapshot),
            quantity: it.quantity,
            line_total: _toNumber(it.line_total),
            options_snapshot: it.options_snapshot,
            item_notes: it.item_notes
        }))
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

    // Body is ignored by design (every field is rederived server-side).
    // Consume it to be a well-behaved HTTP citizen but don't validate.
    try {
        await req.text();
    } catch {
        // Ignore.
    }

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
        const diag = await _fetchSession(supabase, customerSessionId);
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
            console.error("[get-orders-for-session] session lookup failed:", diag.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const session = diag.row;

        // ── Rate limit ──
        try {
            await checkRateLimit(supabase, {
                key: `get-orders-for-session:session:${customerSessionId}`,
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

        // ── Parallel fetch: table, current open group, orders ──
        // The table may be missing if the session lost its table (soft-delete
        // edge case). Treat as nullable rather than failing the request.
        const [tableRow, currentOpenGroupId, orders] = await Promise.all([
            session.current_table_id
                ? _fetchTable(supabase, session.current_table_id)
                : Promise.resolve(null),
            session.current_table_id
                ? _fetchCurrentOpenGroupId(supabase, session.current_table_id)
                : Promise.resolve(null),
            _fetchOrdersWithItems(supabase, customerSessionId)
        ]);

        console.log("[get-orders-for-session] orders_fetched", {
            event: "orders_fetched",
            customer_session_id: customerSessionId,
            order_count: orders.length
        });

        return jsonResponse(200, {
            session_id: session.id,
            table: tableRow
                ? { id: tableRow.id, label: tableRow.label, zone: tableRow.zone }
                : null,
            current_open_group_id: currentOpenGroupId,
            orders: _shapeOrders(orders)
        });
    } catch (e) {
        console.error(
            "[get-orders-for-session] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
