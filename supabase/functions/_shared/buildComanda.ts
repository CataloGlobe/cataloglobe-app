// buildComanda — `order_id` → ComandaPayload (pronto per renderComandaEscPos).
//
// UN SOLO percorso di lettura per la comanda, usato sia dal push inline di
// submit-order / submit-order-admin sia dallo sweeper process-print-jobs.
// Niente duplicazioni FE/Edge (lezione scheduleResolver).
//
// Richiede un client service_role: legge orders + embed PostgREST bypassando
// la RLS. Il chiamante ha gia' verificato l'autorizzazione (customer JWT o
// admin JWT) a monte: qui l'order_id arriva da un INSERT appena eseguito o da
// un print_job claimato, mai dal body di una richiesta.
//
// ⚠️ Filtra le righe con `cancelled_at` non nullo: lo sweeper puo' girare dopo
// una cancellazione di riga (cancel-order-item) e stampare piatti annullati
// manderebbe cibo sbagliato al tavolo.
//
// Operatore: orders.created_by_user_id punta ad auth.users (nessun embed
// possibile verso profiles). Seconda query su `profiles` solo quando il campo
// e' valorizzato (ordine inserito dallo staff). Stessa formula di
// get_tenant_member_names: "first_name last_name", fallback "Staff" come in
// PrintReceipt.tsx.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ComandaItem, ComandaPayload } from "./escpos.ts";

// ============================================================
// Shape della query (embed PostgREST)
// ============================================================

const COMANDA_SELECT = [
    "id",
    "tenant_id",
    "activity_id",
    "submitted_at",
    "notes",
    "customer_name_snapshot",
    "created_by_user_id",
    "is_rectification",
    "activities(name)",
    "tables(label, table_zones(name))",
    "order_items(id, quantity, product_name_snapshot, options_snapshot, item_notes, cancelled_at, created_at)"
].join(", ");

interface OptionsSnapshotRow {
    primary_option?: { value_name?: unknown } | null;
    addons?: Array<{ value_name?: unknown }> | null;
}

interface OrderItemRow {
    id: string;
    quantity: number;
    product_name_snapshot: string;
    options_snapshot: OptionsSnapshotRow | null;
    item_notes: string | null;
    cancelled_at: string | null;
    created_at: string;
}

interface OrderRow {
    id: string;
    tenant_id: string;
    activity_id: string;
    submitted_at: string;
    notes: string | null;
    customer_name_snapshot: string | null;
    created_by_user_id: string | null;
    is_rectification: boolean;
    activities: { name: string } | null;
    tables: { label: string; table_zones: { name: string } | null } | null;
    order_items: OrderItemRow[] | null;
}

interface ProfileRow {
    first_name: string | null;
    last_name: string | null;
}

export type BuildComandaResult =
    | { kind: "ok"; payload: ComandaPayload; tenant_id: string; activity_id: string; activity_name: string | null }
    | { kind: "not_found" }
    | { kind: "db_error"; message: string };

// ============================================================
// Helpers
// ============================================================

function _str(v: unknown): string | null {
    return typeof v === "string" && v.trim().length > 0 ? v : null;
}

function _mapItem(row: OrderItemRow): ComandaItem {
    const snap = row.options_snapshot ?? {};
    const primary = _str(snap.primary_option?.value_name);
    const addons = (snap.addons ?? [])
        .map(a => _str(a?.value_name))
        .filter((v): v is string => v !== null);
    return {
        quantity: row.quantity,
        product_name: row.product_name_snapshot,
        primary_option: primary,
        addons,
        item_notes: _str(row.item_notes)
    };
}

async function _resolveOperatorLabel(
    supabase: SupabaseClient,
    userId: string
): Promise<string> {
    const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name")
        .eq("id", userId)
        .maybeSingle();
    if (error || !data) return "Staff";
    const p = data as ProfileRow;
    const full = [p.first_name, p.last_name]
        .map(s => (s ?? "").trim())
        .filter(s => s.length > 0)
        .join(" ");
    return full.length > 0 ? full : "Staff";
}

// ============================================================
// Entry point
// ============================================================

/**
 * Carica l'ordine con una query singola (embed) e lo mappa in ComandaPayload.
 * Non lancia: ogni fallimento e' un `kind` diverso da "ok".
 */
export async function buildComanda(
    supabase: SupabaseClient,
    orderId: string
): Promise<BuildComandaResult> {
    const { data, error } = await supabase
        .from("orders")
        .select(COMANDA_SELECT)
        .eq("id", orderId)
        .maybeSingle();

    if (error) return { kind: "db_error", message: error.message };
    if (!data) return { kind: "not_found" };

    const row = data as unknown as OrderRow;

    const items = (row.order_items ?? [])
        .filter(i => i.cancelled_at === null)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(_mapItem);

    const operatorLabel = row.created_by_user_id
        ? await _resolveOperatorLabel(supabase, row.created_by_user_id)
        : null;

    const payload: ComandaPayload = {
        order_id: row.id,
        submitted_at: row.submitted_at,
        table_label: row.tables?.label ?? "?",
        table_zone: _str(row.tables?.table_zones?.name),
        operator_label: operatorLabel,
        customer_name: operatorLabel ? null : _str(row.customer_name_snapshot),
        is_rectification: row.is_rectification === true,
        notes: _str(row.notes),
        items
    };

    return {
        kind: "ok",
        payload,
        tenant_id: row.tenant_id,
        activity_id: row.activity_id,
        activity_name: _str(row.activities?.name)
    };
}
