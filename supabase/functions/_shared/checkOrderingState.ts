// @ts-nocheck
//
// checkOrderingState — verifica se l'ordering QR e' abilitato per un dato
// tenant + activity (+ opzionalmente table). Usato in resolve-table (entry
// point QR scan) e submit-order (write nuovo ordine) per intercettare
// maintenance mode mid-session.
//
// Le Edge accessibili (request-bill, cancel-order customer, get-orders-for-
// session, transition admin) NON usano questo helper: clienti con sessione
// gia attiva devono poter cancellare, vedere ordini pregressi e chiedere il
// conto anche durante una sospensione.
//
// Pattern reason:
//   - subscription_inactive: tenant.subscription_status NOT IN ('active','trialing')
//   - tenant_deleted:        tenant.deleted_at IS NOT NULL (o riga assente)
//   - activity_inactive:     activity.status != 'active' (o riga assente)
//   - ordering_disabled:     activity.ordering_enabled = false
//   - feature_not_available: piano del tenant non include 'table_ordering'
//                             (RPC activity_has_feature, fail-closed su NULL/errore)
//   - table_maintenance:     table.maintenance_mode = true
//   - table_deleted:         table.deleted_at IS NOT NULL (o riga assente)
//
// Caller decide se mostrare catalog read-only (ordering_disabled /
// table_maintenance) o full-page error (gli altri reason).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type OrderingStateReason =
    | "subscription_inactive"
    | "tenant_deleted"
    | "activity_inactive"
    | "ordering_disabled"
    | "feature_not_available"
    | "table_maintenance"
    | "table_deleted";

export type OrderingStateResult =
    | { ok: true }
    | { ok: false; reason: OrderingStateReason };

const VALID_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

export interface CheckOrderingStateParams {
    tenantId: string;
    activityId: string;
    tableId?: string | null;
}

export async function checkOrderingState(
    supabase: SupabaseClient,
    params: CheckOrderingStateParams
): Promise<OrderingStateResult> {
    // ── Tenant ──
    const { data: tenant, error: tErr } = await supabase
        .from("tenants")
        .select("id, subscription_status, deleted_at")
        .eq("id", params.tenantId)
        .maybeSingle();

    if (tErr) {
        // Fail-closed: errore DB sul tenant lookup → blocca ordering.
        return { ok: false, reason: "tenant_deleted" };
    }
    if (!tenant) {
        return { ok: false, reason: "tenant_deleted" };
    }
    if (tenant.deleted_at !== null) {
        return { ok: false, reason: "tenant_deleted" };
    }
    if (!VALID_SUBSCRIPTION_STATUSES.has(tenant.subscription_status)) {
        return { ok: false, reason: "subscription_inactive" };
    }

    // ── Activity ──
    const { data: activity, error: aErr } = await supabase
        .from("activities")
        .select("id, status, ordering_enabled")
        .eq("id", params.activityId)
        .maybeSingle();

    if (aErr || !activity) {
        return { ok: false, reason: "activity_inactive" };
    }
    if (activity.status !== "active") {
        return { ok: false, reason: "activity_inactive" };
    }
    if (activity.ordering_enabled === false) {
        return { ok: false, reason: "ordering_disabled" };
    }

    // ── Plan-based feature gate ──
    // Fail-closed: any non-true result (false, null, RPC error) blocks ordering.
    // Belt-and-suspenders with the BEFORE INSERT trigger on `orders` that raises
    // FEATURE_NOT_AVAILABLE; this pre-check turns the would-be DB error into a
    // clean, codified response for the customer.
    const { data: hasOrderingFeature, error: featErr } = await supabase
        .rpc("activity_has_feature", {
            p_activity_id: params.activityId,
            p_feature_id: "table_ordering"
        });
    if (featErr || hasOrderingFeature !== true) {
        return { ok: false, reason: "feature_not_available" };
    }

    // ── Table (opzionale) ──
    if (params.tableId) {
        const { data: table, error: tabErr } = await supabase
            .from("tables")
            .select("id, maintenance_mode, deleted_at")
            .eq("id", params.tableId)
            .maybeSingle();

        if (tabErr || !table) {
            return { ok: false, reason: "table_deleted" };
        }
        if (table.deleted_at !== null) {
            return { ok: false, reason: "table_deleted" };
        }
        if (table.maintenance_mode === true) {
            return { ok: false, reason: "table_maintenance" };
        }
    }

    return { ok: true };
}

/**
 * Reason → messaggio italiano user-facing. Centralizzato qui per evitare
 * drift tra Edge functions.
 */
export function orderingStateMessage(reason: OrderingStateReason): string {
    switch (reason) {
        case "subscription_inactive":
        case "tenant_deleted":
        case "activity_inactive":
            return "L'ordinazione tramite QR non e' al momento disponibile. Chiedi allo staff.";
        case "ordering_disabled":
            return "Il ristorante ha temporaneamente sospeso le ordinazioni tramite QR. Per favore, chiedi allo staff per ordinare.";
        case "feature_not_available":
            return "Gli ordini al tavolo non sono disponibili per questa attivita'. Chiedi allo staff per ordinare.";
        case "table_maintenance":
            return "Questo tavolo non e' al momento disponibile per le ordinazioni. Chiedi allo staff.";
        case "table_deleted":
            return "Questo tavolo non e' al momento disponibile. Chiedi allo staff.";
    }
}

/**
 * Quali reason consentono di mostrare comunque il menu (catalog read-only)?
 * - ordering_disabled / table_maintenance / feature_not_available:
 *   sede operativa, solo ordini QR bloccati → menu in sola lettura
 * - tutti gli altri: nascondere il menu (sede non agibile)
 */
export function shouldShowCatalogReadOnly(reason: OrderingStateReason): boolean {
    return reason === "ordering_disabled"
        || reason === "table_maintenance"
        || reason === "feature_not_available";
}
