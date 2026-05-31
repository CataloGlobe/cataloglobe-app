// @ts-nocheck
//
// resolve-table — public entry point for the table-ordering epic.
//
// Hit by the guest's phone immediately after a QR scan. Looks up the
// table row via qr_token (raw query, no status filtering), runs the
// shared `checkOrderingState` helper to discriminate the actual cause
// when ordering is unavailable, then either reuses or creates a
// `customer_sessions` row, signs a custom JWT (role: "anon" +
// customer_session_id claim), and returns the bundle the client needs
// to start ordering.
//
// Maintenance-mode handling (mid-session epic):
//   - 404 TOKEN_NOT_FOUND   → qr_token doesn't exist at all (only "real" 404).
//   - 423 ORDERING_UNAVAILABLE + reason payload (subscription_inactive /
//     tenant_deleted / activity_inactive / ordering_disabled /
//     table_maintenance / table_deleted). `canViewMenu` lets the client
//     decide: redirect to /:slug for catalog read-only (ordering_disabled,
//     table_maintenance) vs full-page error (others).
//
// Anon-facing. All sensitive data is rederived server-side from the
// token — nothing from the request body is trusted besides `qr_token`
// (validated as UUID) and the optional `existing_session_id`.
//
// See docs/orders-architecture.md v1.1 §3.1 (session lifecycle),
// §3.2 (table-fusion model B+), §5.2 (JWT pattern), §5.3 (RPC).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { signCustomerJwt } from "../_shared/customerJwt.ts";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import {
    checkOrderingState,
    orderingStateMessage,
    shouldShowCatalogReadOnly
} from "../_shared/checkOrderingState.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// JWT + session lifetime. Aligned with `customer_sessions.expires_at`
// computed below.
const SESSION_TTL_SECONDS = 12 * 60 * 60;

// Rate-limit configuration. 30 req/min per qr_token is generous for any
// legitimate "many guests scan the same QR" scenario and still narrows
// abuse to one specific token at a time.
const RATE_LIMIT_PER_TOKEN_PER_MIN = 30;

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Internal types
// ============================================================

interface TableInfo {
    table_id: string;
    tenant_id: string;
    activity_id: string;
    activity_slug: string;
    label: string;
    zone: string | null;
    maintenance_mode: boolean;
}

interface CustomerSessionRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    current_table_id: string | null;
    order_group_id: string | null;
    customer_name: string | null;
    first_seen_at: string;
    last_activity_at: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
}

interface OtherActiveSession {
    session_id: string;
    customer_name: string | null;
    has_active_orders: boolean;
}

// ============================================================
// Local error classes
// ============================================================

class TokenNotFoundError extends Error {
    constructor() {
        super("QR code non valido. Verifica con lo staff.");
        this.name = "TokenNotFoundError";
    }
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

/**
 * Lookup raw del tavolo via qr_token. NON filtra per status/deleted_at:
 * delega tutta la logica di "ordering disponibile?" a checkOrderingState
 * cosi possiamo restituire una reason specifica anziche un 404 generico.
 *
 * Service-role client bypassa RLS, quindi questo SELECT funziona anche
 * su righe activity inactive / table soft-deleted.
 */
async function _fetchTableRaw(
    supabase: SupabaseClient,
    qrToken: string
): Promise<TableInfo> {
    const { data, error } = await supabase
        .from("tables")
        .select(
            "id, tenant_id, activity_id, label, maintenance_mode, " +
            "zone_id, " +
            "zone_data:table_zones!tables_zone_id_fkey(name), " +
            "activities!inner(slug)"
        )
        .eq("qr_token", qrToken)
        .maybeSingle();

    if (error) {
        throw new Error(`tables select failed: ${error.message}`);
    }
    if (!data) {
        throw new TokenNotFoundError();
    }
    const row = data as {
        id: string;
        tenant_id: string;
        activity_id: string;
        label: string;
        maintenance_mode: boolean;
        zone_id: string | null;
        zone_data: { name: string } | { name: string }[] | null;
        activities: { slug: string } | { slug: string }[];
    };
    const act = Array.isArray(row.activities) ? row.activities[0] : row.activities;
    const zoneObj = Array.isArray(row.zone_data) ? row.zone_data[0] : row.zone_data;
    return {
        table_id: row.id,
        tenant_id: row.tenant_id,
        activity_id: row.activity_id,
        activity_slug: act?.slug ?? "",
        label: row.label,
        // Alias backward-compat: payload customer espone `zone` come stringa-o-null.
        // Customer localStorage e ResolveTableResult.table.zone preservati.
        zone: zoneObj?.name ?? null,
        maintenance_mode: row.maintenance_mode
    };
}

async function _resolveOrCreateSession(
    supabase: SupabaseClient,
    table: TableInfo,
    existingSessionId: string | null
): Promise<{ session: CustomerSessionRow; isNew: boolean }> {
    const newExpiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    if (existingSessionId) {
        const { data: existing, error: selErr } = await supabase
            .from("customer_sessions")
            .select(
                "id, tenant_id, activity_id, current_table_id, order_group_id, " +
                "customer_name, first_seen_at, last_activity_at, expires_at, " +
                "created_at, updated_at"
            )
            .eq("id", existingSessionId)
            .maybeSingle();

        if (selErr) {
            throw new Error(`customer_sessions select failed: ${selErr.message}`);
        }

        // Reuse only if found, not expired, and same tenant. Cross-tenant
        // bleed-through must never happen.
        const reusable =
            existing &&
            (existing as CustomerSessionRow).tenant_id === table.tenant_id &&
            new Date((existing as CustomerSessionRow).expires_at).getTime() > Date.now();

        if (reusable) {
            const { data: updated, error: updErr } = await supabase
                .from("customer_sessions")
                .update({
                    activity_id: table.activity_id,
                    current_table_id: table.table_id,
                    last_activity_at: new Date().toISOString(),
                    expires_at: newExpiresAt
                })
                .eq("id", existingSessionId)
                .select(
                    "id, tenant_id, activity_id, current_table_id, order_group_id, " +
                    "customer_name, first_seen_at, last_activity_at, expires_at, " +
                    "created_at, updated_at"
                )
                .single();

            if (updErr) {
                throw new Error(`customer_sessions update failed: ${updErr.message}`);
            }
            return { session: updated as CustomerSessionRow, isNew: false };
        }
        // Fall through to creation when not reusable.
    }

    const { data: created, error: insErr } = await supabase
        .from("customer_sessions")
        .insert({
            tenant_id: table.tenant_id,
            activity_id: table.activity_id,
            current_table_id: table.table_id,
            expires_at: newExpiresAt
        })
        .select(
            "id, tenant_id, activity_id, current_table_id, order_group_id, " +
            "customer_name, first_seen_at, last_activity_at, expires_at, " +
            "created_at, updated_at"
        )
        .single();

    if (insErr) {
        throw new Error(`customer_sessions insert failed: ${insErr.message}`);
    }
    return { session: created as CustomerSessionRow, isNew: true };
}

async function _loadOtherActiveSessions(
    supabase: SupabaseClient,
    currentSessionId: string,
    activityId: string,
    tableId: string
): Promise<OtherActiveSession[]> {
    const nowIso = new Date().toISOString();

    const { data: sessions, error: sErr } = await supabase
        .from("customer_sessions")
        .select("id, customer_name")
        .eq("activity_id", activityId)
        .eq("current_table_id", tableId)
        .neq("id", currentSessionId)
        .gt("expires_at", nowIso);

    if (sErr) {
        throw new Error(`other-sessions select failed: ${sErr.message}`);
    }

    const rows = (sessions ?? []) as Array<{ id: string; customer_name: string | null }>;
    if (rows.length === 0) return [];

    const sessionIds = rows.map(r => r.id);

    const { data: activeOrders, error: oErr } = await supabase
        .from("orders")
        .select("customer_session_id")
        .in("customer_session_id", sessionIds)
        .in("status", ["submitted", "acknowledged"]);

    if (oErr) {
        throw new Error(`orders existence-check failed: ${oErr.message}`);
    }

    const withActiveOrders = new Set<string>(
        ((activeOrders ?? []) as Array<{ customer_session_id: string }>).map(
            r => r.customer_session_id
        )
    );

    return rows.map(r => ({
        session_id: r.id,
        customer_name: r.customer_name,
        has_active_orders: withActiveOrders.has(r.id)
    }));
}

async function _loadCurrentOpenGroupId(
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

async function _buildSuccessPayload(
    supabase: SupabaseClient,
    table: TableInfo,
    session: CustomerSessionRow
): Promise<Record<string, unknown>> {
    const [otherSessions, currentOpenGroupId] = await Promise.all([
        _loadOtherActiveSessions(supabase, session.id, table.activity_id, table.table_id),
        _loadCurrentOpenGroupId(supabase, table.table_id)
    ]);

    const jwt = await signCustomerJwt(session.id, SESSION_TTL_SECONDS);

    return {
        jwt,
        session_id: session.id,
        expires_at: session.expires_at,
        table: {
            id: table.table_id,
            label: table.label,
            zone: table.zone,
            maintenance_mode: table.maintenance_mode
        },
        activity: {
            id: table.activity_id,
            slug: table.activity_slug
        },
        tenant_id: table.tenant_id,
        other_active_sessions_at_table: otherSessions,
        current_open_group_id: currentOpenGroupId
    };
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
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "Body JSON malformato."
        });
    }

    const qrToken = (body as { qr_token?: unknown })?.qr_token;
    if (!_isUuid(qrToken)) {
        return jsonResponse(400, {
            code: "INVALID_REQUEST",
            message: "qr_token mancante o non valido."
        });
    }

    const rawExisting = (body as { existing_session_id?: unknown })?.existing_session_id;
    const existingSessionId = _isUuid(rawExisting) ? rawExisting : null;

    // ── Build service-role client ──
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Rate limit (per qr_token) ──
        await checkRateLimit(supabase, {
            key: `resolve-table:qr-token:${qrToken}`,
            limit: RATE_LIMIT_PER_TOKEN_PER_MIN,
            windowSeconds: 60
        });

        // ── Lookup raw table (no status filtering) ──
        const table = await _fetchTableRaw(supabase, qrToken);

        // ── Ordering state check (tenant + activity + table) ──
        const state = await checkOrderingState(supabase, {
            tenantId: table.tenant_id,
            activityId: table.activity_id,
            tableId: table.table_id
        });

        if (!state.ok) {
            return jsonResponse(423, {
                code: "ORDERING_UNAVAILABLE",
                reason: state.reason,
                message: orderingStateMessage(state.reason),
                canViewMenu: shouldShowCatalogReadOnly(state.reason),
                tenant_id: table.tenant_id,
                activity: {
                    id: table.activity_id,
                    slug: table.activity_slug
                },
                table: {
                    id: table.table_id,
                    label: table.label,
                    zone: table.zone
                }
            });
        }

        // ── Resolve or create session ──
        const { session } = await _resolveOrCreateSession(supabase, table, existingSessionId);

        // Defensive: session must reflect the scanned table.
        if (session.current_table_id !== table.table_id) {
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Build response ──
        const payload = await _buildSuccessPayload(supabase, table, session);
        return jsonResponse(200, payload);
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
        if (e instanceof TokenNotFoundError) {
            return jsonResponse(404, {
                code: "TOKEN_NOT_FOUND",
                message: e.message
            });
        }
        // Unknown error: keep the response generic, do not leak qr_token or
        // internal details in the user-visible body. The Edge Function
        // platform captures the thrown message in the function logs for
        // operators.
        console.error("resolve-table internal error:", (e as Error)?.message);
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
