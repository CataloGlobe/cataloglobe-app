// @ts-nocheck
//
// submit-order-admin — endpoint admin per registrare una comanda manuale
// inserita da un operatore autenticato (es. cameriere) su un tavolo
// specifico. Gemello di submit-order (customer) per la pipeline di
// validazione e snapshot prezzi, gemello di cancel-order-admin per il
// modello di autenticazione e gating permessi.
//
// Differenze chiave rispetto a submit-order:
//   - Auth: JWT utente Supabase standard (NON JWT custom customer).
//   - Tenant/activity derivati dal `table_id` letto da DB (mai dal body).
//   - Permesso: has_permission('orders.manage', activity_id).
//   - Disponibilita': verifica tenant subscription + activity active +
//     table non-deleted/non-maintenance. NON blocca su ordering_enabled
//     (operatore puo' inserire comande anche con QR-ordering disabilitato).
//   - Sessione: upsert di una "staff session" sentinel per tavolo
//     (device_id = "staff:{table_id}"), riusata tra invocazioni dallo
//     stesso operatore o operatori diversi.
//   - Order group: lookup dell'open group del tavolo e passaggio esplicito
//     come p_target_group_id (fusione naturale con comande cliente in
//     corso). Se nessun gruppo aperto, RPC ne crea uno lazy.
//   - Audit: stamping best-effort di orders.created_by_user_id = auth.uid()
//     post-RPC (non blocca la response su fallimento).
//
// Trust boundary: solo `table_id`, `items[]`, `notes`, `customer_label`
// sono presi dal body. tenant_id, activity_id, current_table_id,
// customer_name_snapshot e resolved_schedule_id sono rederivati lato
// server (tabella tables + staff session + scheduleResolver).
//
// See docs/orders-architecture.md v1.2 §6 (order submit), §7 (order_groups
// lifecycle) e CLAUDE.md sezione "Epic Ordinazioni dal tavolo".

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, RateLimitExceededError } from "../_shared/rateLimit.ts";
import {
    validateAndSnapshotOrderItems,
    ValidateOrderItemsError,
    type RequestedOrderItem,
    type ValidatedOrder
} from "../_shared/validateOrderItems.ts";

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Rate-limit: 30 submit per minuto per (user, table). Allineato al limite
// usato dalle transizioni admin in adminOrderTransition.ts (30/min per
// user+order). Una sala tipica vede ben sotto questo throughput.
const RATE_LIMIT_PER_USER_PER_TABLE_PER_MIN = 30;

// Staff session TTL: 12h come la customer session (resolve-table
// SESSION_TTL_SECONDS). La sentinel per tavolo viene rinnovata ad ogni
// submit, quindi il TTL serve solo da garbage-collection cap.
const STAFF_SESSION_TTL_SECONDS = 12 * 60 * 60;

// Default label se il body non passa customer_label esplicito.
const DEFAULT_STAFF_LABEL = "Comanda manuale";
const STAFF_LABEL_MAX_LEN = 100;

// Note length: mirror submit-order + DB CHECK constraint
// (20260526180000_orders_notes_length_check.sql).
const ORDER_NOTES_MAX_LEN = 300;
const ITEM_NOTES_MAX_LEN = 140;

// Subscription status validi per ordering. Mirror checkOrderingState.ts —
// replichiamo inline qui per poter bypassare ordering_enabled senza
// modificare l'helper condiviso (usato da resolve-table e submit-order).
const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ============================================================
// Request body types
// ============================================================

interface SubmitOrderAdminRequestBody {
    table_id: string;
    items: RequestedOrderItem[];
    notes: string | null;
    customer_label: string | null;
}

interface TableLookupRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    maintenance_mode: boolean;
    deleted_at: string | null;
}

interface StaffSessionRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    current_table_id: string | null;
    order_group_id: string | null;
    customer_name: string | null;
    expires_at: string;
}

interface RpcSuccessPayload {
    order_id: string;
    order_group_id: string;
    status: string;
    created_at: string;
}

type AdminOrderingReason =
    | "subscription_inactive"
    | "tenant_deleted"
    | "activity_inactive"
    | "table_maintenance"
    | "table_deleted";

// ============================================================
// Sanitization helpers
// ============================================================

class SanitizeNoteTooLong extends Error {
    constructor(public readonly maxLen: number) {
        super(`Note too long: max ${maxLen} characters.`);
    }
}

function _isUuid(s: unknown): s is string {
    return typeof s === "string" && UUID_RE.test(s);
}

function _sanitizeNote(raw: unknown, maxLen: number): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLen) {
        throw new SanitizeNoteTooLong(maxLen);
    }
    return trimmed;
}

function _sanitizeLabel(raw: unknown, maxLen: number): string | null {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (trimmed.length === 0) return null;
    if (trimmed.length > maxLen) return null;
    return trimmed;
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

function _adminOrderingMessage(reason: AdminOrderingReason): string {
    switch (reason) {
        case "subscription_inactive":
            return "L'abbonamento del ristorante non e' attivo. Contatta l'amministratore.";
        case "tenant_deleted":
            return "Azienda non disponibile.";
        case "activity_inactive":
            return "Sede non attiva, impossibile registrare comande.";
        case "table_maintenance":
            return "Tavolo in manutenzione, impossibile registrare comande.";
        case "table_deleted":
            return "Tavolo non disponibile.";
    }
}

// ============================================================
// Body parse
// ============================================================

function _parseAndValidateBody(
    raw: unknown
): SubmitOrderAdminRequestBody | { error: string } {
    if (!raw || typeof raw !== "object") {
        return { error: "Body must be a JSON object." };
    }
    const obj = raw as Record<string, unknown>;

    if (!_isUuid(obj.table_id)) {
        return { error: "`table_id` must be a UUID." };
    }

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
                const sanitized = _sanitizeNote(itObj.item_notes, ITEM_NOTES_MAX_LEN);
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

    let notes: string | null = null;
    if (obj.notes !== undefined && obj.notes !== null) {
        if (typeof obj.notes !== "string") {
            return { error: "`notes` must be a string or null." };
        }
        try {
            notes = _sanitizeNote(obj.notes, ORDER_NOTES_MAX_LEN);
        } catch (e) {
            if (e instanceof SanitizeNoteTooLong) {
                return {
                    error: `\`notes\` too long (max ${ORDER_NOTES_MAX_LEN} characters).`
                };
            }
            throw e;
        }
    }

    const customerLabel = _sanitizeLabel(obj.customer_label, STAFF_LABEL_MAX_LEN);

    return {
        table_id: obj.table_id as string,
        items,
        notes,
        customer_label: customerLabel
    };
}

// ============================================================
// Auth helpers
// ============================================================

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

async function _hasOrdersManagePermission(
    supabaseUser: SupabaseClient,
    activityId: string
): Promise<{ kind: "ok"; allowed: boolean } | { kind: "db_error"; message: string }> {
    const { data, error } = await supabaseUser.rpc("has_permission", {
        p_permission_id: "orders.manage",
        p_activity_id: activityId
    });
    if (error) {
        return { kind: "db_error", message: error.message };
    }
    return { kind: "ok", allowed: data === true };
}

// ============================================================
// Domain helpers (table lookup, admin ordering gate, staff session,
// open order group)
// ============================================================

async function _fetchTable(
    supabase: SupabaseClient,
    tableId: string
): Promise<
    | { kind: "ok"; row: TableLookupRow }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase
        .from("tables")
        .select("id, tenant_id, activity_id, maintenance_mode, deleted_at")
        .eq("id", tableId)
        .maybeSingle();

    if (error) {
        return { kind: "db_error", message: error.message };
    }
    if (!data) {
        return { kind: "not_found" };
    }
    return { kind: "ok", row: data as TableLookupRow };
}

/**
 * Variante di checkOrderingState che NON blocca su ordering_enabled.
 * L'operatore puo' inserire comande anche con QR-ordering disabilitato:
 * QR off riguarda solo i clienti, non lo staff.
 *
 * Blocca per: subscription scaduta, tenant cancellato, activity inactive,
 * tavolo in maintenance o deleted.
 */
async function _checkAdminOrderingState(
    supabase: SupabaseClient,
    params: { tenantId: string; activityId: string; table: TableLookupRow }
): Promise<{ ok: true } | { ok: false; reason: AdminOrderingReason }> {
    // Tenant
    const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select("id, subscription_status, deleted_at")
        .eq("id", params.tenantId)
        .maybeSingle();

    if (tErr || !tenant) {
        return { ok: false, reason: "tenant_deleted" };
    }
    if (tenant.deleted_at !== null) {
        return { ok: false, reason: "tenant_deleted" };
    }
    if (!VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)) {
        return { ok: false, reason: "subscription_inactive" };
    }

    // Activity
    const { data: activity, error: aErr } = await supabase
        .from("activities")
        .select("id, status")
        .eq("id", params.activityId)
        .maybeSingle();

    if (aErr || !activity) {
        return { ok: false, reason: "activity_inactive" };
    }
    if (activity.status !== "active") {
        return { ok: false, reason: "activity_inactive" };
    }

    // Table — usiamo la row gia' caricata in _fetchTable, niente re-fetch.
    if (params.table.deleted_at !== null) {
        return { ok: false, reason: "table_deleted" };
    }
    if (params.table.maintenance_mode === true) {
        return { ok: false, reason: "table_maintenance" };
    }

    return { ok: true };
}

/**
 * Upsert idempotente della staff session sentinel per il tavolo.
 *
 * device_id = `staff:{table_id}` (table_id e' uuid globale: la coppia
 * (device_id, tenant_id) e' univoca per tavolo). Se la session esiste e
 * non e' scaduta → UPDATE (rinnova TTL, riporta tavolo corrente). Se
 * scaduta o assente → INSERT nuova. customer_name viene aggiornato al
 * label corrente cosi' che le comande successive riflettano l'etichetta
 * piu' recente passata dall'operatore.
 *
 * Race-safety: l'index su (device_id, tenant_id) NON e' UNIQUE; due
 * INSERT concorrenti potrebbero entrambi succedere. Caso bordo accettato:
 * la seconda staff session resterebbe orfana (nessun ordine la
 * referenzia) e scadrebbe entro 12h. Nessun impatto su current_total o
 * stato tavolo.
 */
async function _upsertStaffSession(
    supabase: SupabaseClient,
    table: TableLookupRow,
    label: string
): Promise<StaffSessionRow> {
    const deviceId = `staff:${table.id}`;
    const nowIso = new Date().toISOString();
    const newExpiresAt = new Date(Date.now() + STAFF_SESSION_TTL_SECONDS * 1000).toISOString();

    const { data: existing, error: selErr } = await supabase
        .from("customer_sessions")
        .select(
            "id, tenant_id, activity_id, current_table_id, order_group_id, " +
            "customer_name, expires_at"
        )
        .eq("device_id", deviceId)
        .eq("tenant_id", table.tenant_id)
        .order("last_activity_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (selErr) {
        throw new Error(`staff session lookup failed: ${selErr.message}`);
    }

    if (existing) {
        const { data: updated, error: updErr } = await supabase
            .from("customer_sessions")
            .update({
                activity_id: table.activity_id,
                current_table_id: table.id,
                customer_name: label,
                last_activity_at: nowIso,
                expires_at: newExpiresAt
            })
            .eq("id", (existing as StaffSessionRow).id)
            .select(
                "id, tenant_id, activity_id, current_table_id, order_group_id, " +
                "customer_name, expires_at"
            )
            .single();

        if (updErr) {
            throw new Error(`staff session update failed: ${updErr.message}`);
        }
        return updated as StaffSessionRow;
    }

    const { data: created, error: insErr } = await supabase
        .from("customer_sessions")
        .insert({
            tenant_id: table.tenant_id,
            activity_id: table.activity_id,
            current_table_id: table.id,
            customer_name: label,
            device_id: deviceId,
            expires_at: newExpiresAt
        })
        .select(
            "id, tenant_id, activity_id, current_table_id, order_group_id, " +
            "customer_name, expires_at"
        )
        .single();

    if (insErr) {
        throw new Error(`staff session insert failed: ${insErr.message}`);
    }
    return created as StaffSessionRow;
}

/**
 * Lookup race-tolerant del gruppo 'open' del tavolo. Se presente, lo
 * passiamo come p_target_group_id alla RPC (fusione con comande gia'
 * aperte da cliente o operatore precedente). Se assente, ritorniamo
 * null e la RPC ne crea uno lazy (branch B di submit_order_atomic).
 */
async function _loadOpenOrderGroupForTable(
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

// ============================================================
// RPC submit_order_atomic
// ============================================================

async function _invokeSubmitOrderAtomic(
    supabase: SupabaseClient,
    validated: ValidatedOrder,
    targetGroupId: string | null,
    customerNameSnapshot: string
): Promise<
    | { kind: "ok"; payload: RpcSuccessPayload }
    | { kind: "group_conflict"; message: string }
    | { kind: "invalid_params"; message: string }
    | { kind: "db_error"; message: string }
> {
    const { data, error } = await supabase.rpc("submit_order_atomic", {
        p_tenant_id: validated.tenant_id,
        p_activity_id: validated.activity_id,
        p_table_id: validated.table_id,
        p_customer_session_id: validated.customer_session_id,
        // Override del customer_name_snapshot estratto dalla session: usiamo
        // sempre il label "Comanda manuale" or quello fornito esplicitamente
        // nel body, cosi' l'etichetta sull'ordine non drifta se la session
        // sentinel viene riusata con label diverso.
        p_customer_name_snapshot: customerNameSnapshot,
        p_resolved_schedule_id: validated.resolved_schedule_id,
        p_total_amount: validated.total_amount,
        p_notes: validated.notes,
        p_items: validated.items,
        p_target_group_id: targetGroupId
    });

    if (error) {
        const msg = error.message ?? "";
        if (msg.startsWith("GROUP_CONFLICT:")) {
            return { kind: "group_conflict", message: msg.replace(/^GROUP_CONFLICT:\s*/, "") };
        }
        if (msg.startsWith("INVALID_PARAMS:")) {
            return { kind: "invalid_params", message: msg.replace(/^INVALID_PARAMS:\s*/, "") };
        }
        return { kind: "db_error", message: msg };
    }

    if (!data || typeof data !== "object") {
        return { kind: "db_error", message: "RPC returned no payload." };
    }
    return { kind: "ok", payload: data as RpcSuccessPayload };
}

// ============================================================
// Response builder
// ============================================================

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
    const body = parsed as SubmitOrderAdminRequestBody;
    const customerLabel = body.customer_label ?? DEFAULT_STAFF_LABEL;

    // ── JWT verify ──
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

    // ── Service-role client (per scritture che bypassano RLS) ──
    const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false }
    });

    try {
        // ── Rate limit per (user, table) ──
        try {
            await checkRateLimit(supabaseService, {
                key: `submit-order-admin:user:${userId}:table:${body.table_id}`,
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

        // ── Lookup tavolo (deriva tenant_id + activity_id dal DB) ──
        const tableFetch = await _fetchTable(supabaseService, body.table_id);
        if (tableFetch.kind === "not_found") {
            return jsonResponse(404, {
                code: "TABLE_NOT_FOUND",
                message: "Tavolo non trovato."
            });
        }
        if (tableFetch.kind === "db_error") {
            console.error("[submit-order-admin] table read error:", tableFetch.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        const table = tableFetch.row;

        // ── Membership check ──
        const membership = await _isMemberOfTenant(supabaseUser, table.tenant_id);
        if (membership.kind === "db_error") {
            console.error(
                "[submit-order-admin] tenant membership read error:",
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

        // ── Permission check: orders.manage sull'activity del tavolo ──
        const perm = await _hasOrdersManagePermission(supabaseUser, table.activity_id);
        if (perm.kind === "db_error") {
            console.error("[submit-order-admin] permission check error:", perm.message);
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (!perm.allowed) {
            return jsonResponse(403, {
                code: "FORBIDDEN",
                message: "Permesso insufficiente per gestire ordini su questa sede."
            });
        }

        // ── Admin ordering gate (bypassa ordering_enabled) ──
        const gate = await _checkAdminOrderingState(supabaseService, {
            tenantId: table.tenant_id,
            activityId: table.activity_id,
            table
        });
        if (!gate.ok) {
            return jsonResponse(423, {
                code: "ORDERING_UNAVAILABLE",
                reason: gate.reason,
                message: _adminOrderingMessage(gate.reason)
            });
        }

        // ── Upsert staff session sentinel ──
        let staffSession: StaffSessionRow;
        try {
            staffSession = await _upsertStaffSession(supabaseService, table, customerLabel);
        } catch (e) {
            console.error(
                "[submit-order-admin] staff session upsert failed:",
                (e as Error)?.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Lookup open order group del tavolo (fusione naturale con
        //    eventuali comande cliente/operatore in corso) ──
        let targetGroupId: string | null;
        try {
            targetGroupId = await _loadOpenOrderGroupForTable(supabaseService, table.id);
        } catch (e) {
            console.error(
                "[submit-order-admin] open group lookup failed:",
                (e as Error)?.message
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Validate + snapshot items via helper condiviso ──
        // Il validator rifa il lookup della session, deriva tenant/activity/
        // table, risolve catalogo e schedule, ricalcola prezzi. Lo riusiamo
        // 1:1 dal flusso customer per garantire stessa pricing pipeline.
        let validated: ValidatedOrder;
        try {
            validated = await validateAndSnapshotOrderItems(
                supabaseService,
                staffSession.id,
                body.items,
                body.notes ?? undefined
            );
        } catch (e) {
            if (e instanceof ValidateOrderItemsError) {
                if (e.code === "SESSION_INVALID") {
                    console.error(
                        "[submit-order-admin] staff session invalid during validation:",
                        e.message,
                        { staff_session_id: staffSession.id, table_id: table.id }
                    );
                    return jsonResponse(500, {
                        code: "INTERNAL_ERROR",
                        message: "Errore interno."
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
            supabaseService,
            validated,
            targetGroupId,
            customerLabel
        );
        if (rpc.kind === "group_conflict") {
            return jsonResponse(409, {
                code: "GROUP_CONFLICT",
                message: rpc.message
            });
        }
        if (rpc.kind === "invalid_params") {
            console.error(
                "[submit-order-admin] RPC INVALID_PARAMS (server bug):",
                rpc.message,
                { user_id: userId, table_id: table.id }
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }
        if (rpc.kind === "db_error") {
            console.error(
                "[submit-order-admin] RPC error:",
                rpc.message,
                { user_id: userId, table_id: table.id }
            );
            return jsonResponse(500, {
                code: "INTERNAL_ERROR",
                message: "Errore interno."
            });
        }

        // ── Stamp created_by_user_id (best-effort, non-blocking) ──
        const { error: stampErr } = await supabaseService
            .from("orders")
            .update({ created_by_user_id: userId })
            .eq("id", rpc.payload.order_id)
            .eq("tenant_id", validated.tenant_id);
        if (stampErr) {
            console.warn(
                "[submit-order-admin] created_by_user_id stamp failed (order still committed):",
                stampErr.message,
                { order_id: rpc.payload.order_id, user_id: userId }
            );
        }

        // ── Invalidate any pending bill request on the table ──
        // Mirror del comportamento di submit-order: una nuova comanda
        // (cliente or operatore) implica che il tavolo non e' piu' "pronto
        // a pagare". Idempotente e non-blocking.
        const nowIso = new Date().toISOString();
        const { data: cleared, error: clearErr } = await supabaseService
            .from("customer_sessions")
            .update({ bill_requested_at: null })
            .eq("current_table_id", table.id)
            .eq("tenant_id", table.tenant_id)
            .gt("expires_at", nowIso)
            .not("bill_requested_at", "is", null)
            .select("id");
        if (clearErr) {
            console.error(
                "[submit-order-admin] bill_requested_at clear failed:",
                clearErr.message,
                { user_id: userId, table_id: table.id }
            );
        } else if (cleared && cleared.length > 0) {
            console.log("[submit-order-admin] bill_requested_cleared", {
                event: "bill_requested_cleared",
                user_id: userId,
                table_id: table.id,
                cleared_sessions_count: cleared.length
            });
        }

        // ── Success ──
        console.log("[submit-order-admin] order_submitted", {
            event: "order_submitted",
            source: "admin",
            user_id: userId,
            tenant_id: table.tenant_id,
            activity_id: table.activity_id,
            table_id: table.id,
            staff_session_id: staffSession.id,
            order_id: rpc.payload.order_id,
            order_group_id: rpc.payload.order_group_id,
            item_count: validated.items.length,
            total_amount: validated.total_amount
        });

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
            "[submit-order-admin] internal error:",
            (e as Error)?.message,
            (e as Error)?.stack
        );
        return jsonResponse(500, {
            code: "INTERNAL_ERROR",
            message: "Errore interno."
        });
    }
});
