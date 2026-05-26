// V2Table — riga grezza della tabella `public.tables`.
// Nel service queries `deleted_at` è sempre null (filtrato).
export interface V2Table {
    id: string;
    tenant_id: string;
    activity_id: string;
    label: string;
    qr_token: string;
    seats: number | null;
    zone: string | null;
    maintenance_mode: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

// V2TableInsert — payload per INSERT. Esclude colonne con DEFAULT o gestite dal DB.
// `qr_token` è DEFAULT gen_random_uuid(); `id`/`created_at`/`updated_at`/`deleted_at`
// sono pure DEFAULT o gestite dal DB.
export interface V2TableInsert {
    tenant_id: string;
    activity_id: string;
    label: string;
    seats?: number | null;
    zone?: string | null;
    maintenance_mode?: boolean;
}

// V2TableUpdate — payload per UPDATE. Solo campi mutabili dall'admin.
// `qr_token` NON è qui (usare `regenerateTableQrToken` dedicato).
// `tenant_id` e `activity_id` NON modificabili (un tavolo non cambia sede).
export interface V2TableUpdate {
    label?: string;
    seats?: number | null;
    zone?: string | null;
    maintenance_mode?: boolean;
}

// ─── Customer Sessions ──────────────────────────────────────────────────────

/**
 * Riga grezza di customer_sessions (sia letta da admin che da customer).
 */
export interface V2CustomerSession {
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

/**
 * Response dell'Edge Function resolve-table. Combina jwt + session + table +
 * activity in un unico payload "tutto quello che serve al customer per partire".
 */
export interface ResolveTableResult {
    jwt: string;
    session_id: string;
    expires_at: string;
    table: {
        id: string;
        label: string;
        zone: string | null;
        maintenance_mode: boolean;
    };
    activity: {
        id: string;
        slug: string;
    };
    tenant_id: string;
    other_active_sessions_at_table: Array<{
        id: string;
        customer_name: string | null;
        first_seen_at: string;
    }>;
    current_open_group_id: string | null;
}

/**
 * Response dell'Edge Function close-table.
 */
export interface CloseTableResult {
    table_id: string;
    closed_groups_count: number;
    closed_orders_count: number;
}

// ─── Product Availability ──────────────────────────────────────────────────

/**
 * Riga grezza di product_availability_overrides.
 * Una riga per (activity_id, product_id) coppia: vincolo UNIQUE garantisce
 * unicità. Le righe con available=true sono "leftover" post auto-reset cron
 * (funzionalmente equivalenti a "nessuna riga").
 */
export interface V2ProductAvailabilityOverride {
    id: string;
    tenant_id: string;
    activity_id: string;
    product_id: string;
    available: boolean;
    disabled_at: string | null;
    disabled_reason: string | null;
    auto_reset_at: string | null;
    disabled_by: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Scope di disabilitazione (parametro Edge Function, non colonna DB).
 *   - "daily": auto-reset cron alle prossime 04:00 UTC
 *   - "indefinite": resta disabilitato finché admin non riabilita
 */
export type ProductAvailabilityScope = "daily" | "indefinite";

// V2TableWithState — riga della view `public.v_tables_with_state`
// (migration 20260519180000). Estende V2Table con i 4 aggregati derivati
// runtime da `customer_sessions` / `orders` / `order_groups`.
//
// `current_total` è NUMERIC lato Postgres (supabase-js lo serializza come
// stringa): il service `listTablesWithState` lo normalizza a number prima
// di ritornarlo, quindi qui è tipato `number`.
export interface V2TableWithState extends V2Table {
    active_sessions_count: number;
    pending_orders_count: number;
    open_groups_count: number;
    current_total: number;
}

// ─── Orders ────────────────────────────────────────────────────────────────

export type OrderStatus =
    | "submitted"
    | "acknowledged"
    | "delivered"
    | "cancelled";

export type CancelledBy = "customer" | "admin";

/**
 * Riga grezza della tabella `orders`.
 * total_amount è normalizzato a number nei service (sourcing da SELECT diretti).
 * Le response da Edge Functions arrivano già normalizzate.
 */
export interface V2Order {
    id: string;
    tenant_id: string;
    activity_id: string;
    table_id: string;
    customer_session_id: string;
    order_group_id: string | null;
    parent_order_id: string | null;
    is_rectification: boolean;
    customer_name_snapshot: string | null;
    status: OrderStatus;
    version: number;
    submitted_at: string;
    acknowledged_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
    cancelled_by: CancelledBy | null;
    cancellation_reason: string | null;
    notes: string | null;
    total_amount: number;
    currency: string;
    resolved_schedule_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrderOptionsSnapshotPrimary {
    group_id: string;
    group_name: string;
    value_id: string;
    value_name: string;
}

export interface OrderOptionsSnapshotAddon extends OrderOptionsSnapshotPrimary {
    price_delta: number;
}

export interface OrderOptionsSnapshot {
    primary_option: OrderOptionsSnapshotPrimary | null;
    addons: OrderOptionsSnapshotAddon[];
}

/**
 * Riga grezza di order_items, normalizzata (numeric → number).
 */
export interface V2OrderItem {
    id: string;
    order_id: string;
    product_id: string | null;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    line_total: number;
    options_snapshot: OrderOptionsSnapshot;
    item_notes: string | null;
    created_at: string;
}

/**
 * Snapshot item ritornato da submit-order: la RPC submit_order_atomic NON
 * ritorna gli id delle righe order_items inserite, solo i campi snapshot.
 * Tipo distinto da V2OrderItem per evitare id: null fuorvianti.
 */
export interface OrderItemSubmitSnapshot {
    product_id: string | null;
    product_name_snapshot: string;
    unit_price_snapshot: number;
    quantity: number;
    line_total: number;
    options_snapshot: OrderOptionsSnapshot;
    item_notes: string | null;
}

export type OrderGroupStatus = "open" | "closed";

export interface V2OrderGroup {
    id: string;
    tenant_id: string;
    activity_id: string;
    table_id: string;
    status: OrderGroupStatus;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
}

// ─── Customer-side request/response types ─────────────────────────────────

/**
 * Item richiesto dal customer in submit-order. Server valida e arricchisce
 * con snapshot (nome, prezzo, totali).
 */
export interface OrderItemRequest {
    product_id: string;
    quantity: number;
    primary_option_value_id?: string;
    addon_value_ids?: string[];
    item_notes?: string;
}

export interface SubmitOrderResult {
    order_id: string;
    order_group_id: string;
    status: "submitted";
    total_amount: number;
    items: OrderItemSubmitSnapshot[];
    created_at: string;
}

export interface SessionOrderSummary {
    id: string;
    status: OrderStatus;
    total_amount: number;
    order_group_id: string | null;
    notes: string | null;
    created_at: string;
    items: V2OrderItem[];
}

export interface GetOrdersForSessionResult {
    session_id: string;
    table: {
        id: string;
        label: string;
        zone: string | null;
    } | null;
    current_open_group_id: string | null;
    orders: SessionOrderSummary[];
}

export interface CancelOrderCustomerResult {
    order_id: string;
    status: "cancelled";
    version: number;
    cancelled_at: string;
}

// ─── Admin-side result types ──────────────────────────────────────────────

/**
 * Result di acknowledgeOrder. Status letterale per type-safety.
 */
export interface AcknowledgeOrderResult {
    order_id: string;
    status: "acknowledged";
    version: number;
    acknowledged_at: string;
}

export interface DeliverOrderResult {
    order_id: string;
    status: "delivered";
    version: number;
    delivered_at: string;
}

export interface CancelOrderAdminResult {
    order_id: string;
    status: "cancelled";
    version: number;
    cancelled_at: string;
    cancelled_by: "admin";
    cancellation_reason: string | null;
}

export interface RectifyOrderResult {
    rectification_order_id: string;
    parent_order_id: string;
    total_amount: number;
    items_count: number;
    created_at: string;
}

/**
 * Item input per rectifyOrder: lo storno è quantità per riga d'ordine
 * esistente (NON per prodotto — devi avere l'order_item_id).
 */
export interface RectifyOrderItem {
    order_item_id: string;
    quantity: number;
}

/**
 * Order embed dalla query listOrdersForActivity. Include items se richiesto.
 */
export interface V2OrderWithItems extends V2Order {
    items?: V2OrderItem[];
}

/**
 * Opzioni per listOrdersForActivity.
 */
export interface ListOrdersOptions {
    status?: OrderStatus | OrderStatus[];
    tableId?: string;
    dateFrom?: string;
    dateTo?: string;
    includeItems?: boolean;
    limit?: number;
}
