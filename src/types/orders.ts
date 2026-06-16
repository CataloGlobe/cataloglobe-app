// V2Table — riga della tabella `public.tables` arricchita con `zone_name`
// (JOIN su table_zones nei service). Nel service queries `deleted_at` e' sempre
// null (filtrato). `zone_name` e' popolato lato service via select relation
// hint Supabase; e' `null` se il tavolo non ha zona assegnata.
export interface V2Table {
    id: string;
    tenant_id: string;
    activity_id: string;
    label: string;
    qr_token: string;
    seats: number | null;
    zone_id: string | null;
    zone_name: string | null;
    maintenance_mode: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

// V2TableInsert — payload per INSERT. Esclude colonne con DEFAULT o gestite dal DB.
// `qr_token` e' DEFAULT gen_random_uuid(); `id`/`created_at`/`updated_at`/`deleted_at`
// sono DEFAULT o gestite dal DB. `zone_id` opzionale: null = nessuna zona.
export interface V2TableInsert {
    tenant_id: string;
    activity_id: string;
    label: string;
    seats?: number | null;
    zone_id?: string | null;
    maintenance_mode?: boolean;
}

// V2TableUpdate — payload per UPDATE. Solo campi mutabili dall'admin.
// `qr_token` NON e' qui (usare `regenerateTableQrToken` dedicato).
// `tenant_id` e `activity_id` NON modificabili (un tavolo non cambia sede).
export interface V2TableUpdate {
    label?: string;
    seats?: number | null;
    zone_id?: string | null;
    maintenance_mode?: boolean;
}

// V2TableZone — riga di public.table_zones (γ-lite). UNIQUE (activity_id, name).
// FK su tables.zone_id ON DELETE SET NULL.
export interface V2TableZone {
    id: string;
    tenant_id: string;
    activity_id: string;
    name: string;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface V2TableZoneInsert {
    activity_id: string;
    name: string;
    sort_order?: number;
}

export interface V2TableZoneUpdate {
    name?: string;
    sort_order?: number;
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
    /** Timestamp request "Chiedi il conto" customer-side. NULL = no request. */
    bill_requested_at: string | null;
    /** Timestamp ultima "Chiama il cameriere" customer-side. NULL = mai chiamato o resettato. */
    waiter_called_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Reason restituito da resolve-table / submit-order quando l'ordering QR
 * non e' disponibile (status 423 ORDERING_UNAVAILABLE). Allineato con
 * `OrderingStateReason` in `supabase/functions/_shared/checkOrderingState.ts`.
 */
export type OrderingStateReason =
    | "subscription_inactive"
    | "tenant_deleted"
    | "activity_inactive"
    | "ordering_disabled"
    | "table_maintenance"
    | "table_deleted"
    | "table_closed";

/**
 * Payload di errore 423 da resolve-table. `canViewMenu=true` significa che
 * il client puo redirigere al menu in modalita read-only (ordering_disabled /
 * table_maintenance). False = sede non agibile, mostrare full-page error.
 */
export interface ResolveTableOrderingUnavailable {
    code: "ORDERING_UNAVAILABLE";
    reason: OrderingStateReason;
    message: string;
    canViewMenu: boolean;
    tenant_id: string;
    activity: {
        id: string;
        slug: string;
    };
    table: {
        id: string;
        label: string;
        zone: string | null;
    };
}

/**
 * Error throwato da resolveTable() quando l'Edge ritorna 423. Permette al
 * caller di leggere `reason` e decidere se renderizzare il full-page error
 * o redirigere al menu (vedi `ResolveTableOrderingUnavailable.canViewMenu`).
 */
export class ResolveTableOrderingUnavailableError extends Error {
    readonly payload: ResolveTableOrderingUnavailable;
    constructor(payload: ResolveTableOrderingUnavailable) {
        super(payload.message);
        this.name = "ResolveTableOrderingUnavailableError";
        this.payload = payload;
    }
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
 * Azione di risoluzione bulk degli ordini aperti
 * (submitted+acknowledged+ready) alla chiusura tavolo.
 *   - 'deliver' → tutti gli aperti diventano delivered.
 *   - 'cancel'  → tutti gli aperti diventano cancelled (cancelled_by=admin,
 *                 cancellation_reason="Chiusura tavolo").
 */
export type CloseTableOpenOrdersAction = "deliver" | "cancel";

/**
 * Response dell'Edge Function close-table.
 *
 * `resolved_action`:
 *   - 'none'    → nessun aperto da risolvere (chiusura semplice).
 *   - 'deliver' | 'cancel' → bulk-resolve eseguito atomicamente con la
 *                 chiusura order_groups via RPC close_table_with_resolution.
 *
 * `ended_sessions_count`: numero di customer_sessions del tavolo
 *   terminate (expires_at impostato a now()) come parte della chiusura
 *   (migration 20260604100000). Atomicamente con gli altri counts. Il
 *   tavolo torna "Libero" senza attesa TTL.
 */
export interface CloseTableResult {
    table_id: string;
    resolved_action: "none" | CloseTableOpenOrdersAction;
    resolved_orders_count: number;
    closed_groups_count: number;
    closed_orders_count: number;
    cleared_bill_count: number;
    cleared_waiter_count: number;
    ended_sessions_count: number;
}

/**
 * Shape dei `details` su Error.message === "TABLE_HAS_OPEN_ORDERS"
 * thrown da closeTable() quando si chiama senza `action` su un tavolo
 * che ha ordini aperti. Il caller usa `open_orders_count` per gating
 * UI dei bottoni "Segna come servite" / "Annulla tutte".
 */
export interface CloseTableHasOpenOrdersErrorDetails {
    open_orders_count: number;
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

// V2TableActiveOrder — element of v_tables_with_state.active_orders JSON array
// (migration 20260610150000). total_amount arrives as a JS number via
// json_build_object (Postgres numeric → JSON number, no coercion needed).
export interface V2TableActiveOrder {
    id: string;
    status: "submitted" | "acknowledged" | "ready";
    total_amount: number;
    submitted_at: string;
}

// V2TableWithState — riga della view `public.v_tables_with_state`
// (migration 20260519180000 base; 20260603120000 aggiunge open_orders_count;
//  20260610150000 aggiunge active_orders + session_opened_at).
// Estende V2Table con gli aggregati derivati runtime da
// `customer_sessions` / `orders` / `order_groups`.
//
// `current_total` è NUMERIC lato Postgres (supabase-js lo serializza come
// stringa): il service `listTablesWithState` lo normalizza a number prima
// di ritornarlo, quindi qui è tipato `number`.
//
// `pending_orders_count` e `open_orders_count` hanno semantica DIVERSA:
//   - pending: submitted + acknowledged (UI "in cucina o da consegnare").
//   - open: submitted + acknowledged + ready (UI "aperti", base per gate
//     di close-table con risoluzione bulk).
export interface V2TableWithState extends V2Table {
    active_sessions_count: number;
    pending_orders_count: number;
    open_orders_count: number;
    open_groups_count: number;
    current_total: number;
    /** Count sessions attive con bill_requested_at NOT NULL su questo tavolo. */
    bill_requested_count: number;
    /** Count sessions attive con waiter_called_at NOT NULL su questo tavolo. */
    waiter_called_count: number;
    /** Active orders (submitted|acknowledged|ready) for this table. Always an array (never null). */
    active_orders: V2TableActiveOrder[];
    /** Earliest first_seen_at of active sessions; null if no active session. */
    session_opened_at: string | null;
}

// ─── Orders ────────────────────────────────────────────────────────────────

export type OrderStatus =
    | "submitted"
    | "acknowledged"
    | "ready"
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
    ready_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
    cancelled_by: CancelledBy | null;
    cancellation_reason: string | null;
    notes: string | null;
    total_amount: number;
    currency: string;
    resolved_schedule_id: string | null;
    /**
     * Operatore che ha creato l'ordine manualmente da admin (FK auth.users,
     * ON DELETE SET NULL). NULL = ordine creato dal cliente via QR. Valorizzato
     * = ordine "staff" inserito via Edge `submit-order-admin` (stamp best-effort).
     * Migration: 20260607131833_orders_add_created_by_user_id.
     */
    created_by_user_id: string | null;
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
    acknowledged_at: string | null;
    delivered_at: string | null;
    cancelled_at: string | null;
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
    /** Snapshot lato server di customer_sessions.bill_requested_at al fetch.
     *  NULL = nessuna richiesta attiva. Usato dal client per init UI tab Ordini
     *  senza dover attendere il primo Realtime UPDATE. */
    bill_requested_at: string | null;
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

export interface MarkOrderReadyResult {
    order_id: string;
    status: "ready";
    version: number;
    ready_at: string;
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

/**
 * Result di restoreOrder. Mirror dell'Edge Function `restore-order`
 * (delivered → acknowledged). Nessun timestamp dedicato per la transizione
 * di ripristino; `delivered_at` + `ready_at` tornano a null perche' la
 * giornata operativa di "servito" e' annullata.
 */
export interface RestoreOrderResult {
    order_id: string;
    status: "acknowledged";
    version: number;
    delivered_at: null;
    ready_at: null;
}

/**
 * Result di unacknowledgeOrder. Mirror dell'Edge Function
 * `unacknowledge-order` (acknowledged → submitted, "Rimetti in Nuove").
 * `acknowledged_at` viene azzerato per riportare l'ordine allo stato
 * pre-conferma.
 */
export interface UnacknowledgeOrderResult {
    order_id: string;
    status: "submitted";
    version: number;
    acknowledged_at: null;
}

/**
 * Result di unreadyOrder. Mirror dell'Edge Function `unready-order`
 * (ready → acknowledged, "Rimetti in lavorazione"). `ready_at` viene
 * azzerato; `acknowledged_at` NON viene toccato perche' l'ordine torna
 * proprio nello stato `acknowledged` raggiunto in precedenza.
 */
export interface UnreadyOrderResult {
    order_id: string;
    status: "acknowledged";
    version: number;
    ready_at: null;
}

/**
 * Result di undeliverToReady. Mirror dell'Edge Function
 * `undeliver-to-ready` (delivered → ready). Usata come undo di
 * "Servita" quando l'ordine veniva dalla colonna Pronte; `delivered_at`
 * viene azzerato, `ready_at` resta popolato (l'ordine torna proprio
 * nello stato `ready` raggiunto in precedenza).
 */
export interface UndeliverToReadyResult {
    order_id: string;
    status: "ready";
    version: number;
    delivered_at: null;
}

/**
 * Result di uncancelToSubmitted. Mirror dell'Edge Function
 * `uncancel-to-submitted` (cancelled → submitted). Undo immediato di
 * "Elimina" quando l'ordine era stato cancellato dallo stato submitted.
 * Azzera i metadati di cancellazione.
 */
export interface UncancelToSubmittedResult {
    order_id: string;
    status: "submitted";
    version: number;
    cancelled_at: null;
    cancelled_by: null;
    cancellation_reason: null;
}

/**
 * Result di uncancelToAcknowledged. Mirror dell'Edge Function
 * `uncancel-to-acknowledged` (cancelled → acknowledged). Undo immediato
 * quando l'ordine era stato cancellato da acknowledged; `acknowledged_at`
 * resta popolato (stato originale ripristinato).
 */
export interface UncancelToAcknowledgedResult {
    order_id: string;
    status: "acknowledged";
    version: number;
    cancelled_at: null;
    cancelled_by: null;
    cancellation_reason: null;
}

/**
 * Result di uncancelToReady. Mirror dell'Edge Function
 * `uncancel-to-ready` (cancelled → ready). Undo immediato quando
 * l'ordine era stato cancellato da ready; `acknowledged_at` e `ready_at`
 * restano popolati (stato originale ripristinato).
 */
export interface UncancelToReadyResult {
    order_id: string;
    status: "ready";
    version: number;
    cancelled_at: null;
    cancelled_by: null;
    cancellation_reason: null;
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
