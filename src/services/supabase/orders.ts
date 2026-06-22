/**
 * Orders service.
 *
 * Gestisce ordini, transizioni di stato e rettifiche. Dual-auth:
 *
 * CUSTOMER-SIDE (pagina pubblica ordering):
 *   - submitOrder: invio nuovo ordine
 *   - getOrdersForSession: lettura ordini propri della sessione
 *   - cancelOrderCustomer: cancellazione propria (solo status=submitted)
 *
 * ADMIN-SIDE (backoffice tenant):
 *   - listOrdersForActivity: dashboard live + storico
 *   - acknowledgeOrder, deliverOrder: transizioni di stato (optimistic locking)
 *   - cancelOrderAdmin: cancellazione admin con motivazione
 *   - rectifyOrder: rettifica parziale (storno per item con quantità)
 *
 * Optimistic locking (admin-side): le transizioni richiedono expected_version.
 * In caso di conflitto (qualcuno ha modificato l'ordine concorrentemente),
 * il service throw "OPTIMISTIC_LOCK_CONFLICT". Mismatch di stato (es. deliver
 * su un ordine già cancelled) → throw "INVALID_STATE_TRANSITION" con
 * extension property `currentStatus`.
 *
 * Auth customer: header `Authorization: Bearer <customerJwt>` su invoke.
 * Auth admin: default Supabase user JWT (no override).
 */

import { FunctionsHttpError } from "@supabase/supabase-js";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/services/supabase/client";
import type {
    OrderItemRequest,
    SubmitOrderResult,
    GetOrdersForSessionResult,
    CancelOrderCustomerResult,
    AcknowledgeOrderResult,
    MarkOrderReadyResult,
    DeliverOrderResult,
    CancelOrderAdminResult,
    RestoreOrderResult,
    UnacknowledgeOrderResult,
    UnreadyOrderResult,
    UndeliverToReadyResult,
    UncancelToSubmittedResult,
    UncancelToAcknowledgedResult,
    UncancelToReadyResult,
    RectifyOrderResult,
    RectifyOrderItem,
    V2Order,
    V2OrderWithItems,
    V2OrderItem,
    ListOrdersOptions
} from "@/types/orders";

// ─── Error detail shapes ───────────────────────────────────────────────────
// Esportati per consentire al consumer UI di tipizzare correttamente
// `(err as Error & { details?: ... }).details` invece di usare `any`.

/**
 * Shape dei details su Error.message === "INVALID_ITEMS" da submitOrder.
 * I codici provengono dal validator server-side (validateOrderItems.ts).
 */
export interface InvalidItemsErrorDetails {
    reason?:
        | "EMPTY_CART"
        | "INVALID_QUANTITY"
        | "UNAVAILABLE_PRODUCTS"
        | "PRODUCT_NOT_IN_CATALOG"
        | "INVALID_OPTIONS"
        | "PRICE_MISMATCH";
    invalid_items?: Array<{ product_id?: string; reason?: string }>;
    [key: string]: unknown;
}

/**
 * Shape dei details su Error.message === "INVALID_STATE_TRANSITION".
 * `currentStatus` è il valore attuale dell'ordine quando la transition è
 * stata rifiutata.
 * `reason: "OPTIMISTIC_LOCK_CONFLICT"` discrimina lock conflict da
 * mismatch di stato puro.
 */
export interface InvalidStateTransitionErrorDetails {
    current_status?: string;
    reason?: "OPTIMISTIC_LOCK_CONFLICT";
    [key: string]: unknown;
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER-SIDE (custom JWT via Authorization header)
// ═══════════════════════════════════════════════════════════════

/**
 * Invia un nuovo ordine. Items vengono validati e arricchiti server-side
 * (snapshot prezzi, opzioni, totali).
 *
 * @param customerJwt JWT firmato da resolve-table (NON Supabase auth)
 * @param items minimo 1 item con product_id + quantity > 0
 * @param notes opzionale, free-text dell'ordine
 * @param targetGroupId opzionale: per unirsi a un order_group esistente
 *
 * Throws (validation client):
 *   "EMPTY_CART" se items.length === 0
 *
 * Throws (Edge errors → italiano):
 *   400 INVALID_REQUEST     → "Richiesta non valida"
 *   401                     → "Sessione scaduta, scansiona di nuovo il QR"
 *   404 SESSION_NOT_FOUND   → "Sessione non trovata"
 *   409 SESSION_EXPIRED     → "Sessione scaduta, scansiona di nuovo il QR"
 *   409 GROUP_CONFLICT      → "Conflitto sul gruppo ordine, riprova"
 *   422 INVALID_ITEMS       → "INVALID_ITEMS" (raw + extension `details`)
 *   429                     → "Troppe richieste, riprova tra un momento"
 *   500                     → "Errore del server"
 */
export async function submitOrder(
    customerJwt: string,
    items: OrderItemRequest[],
    notes?: string,
    targetGroupId?: string | null
): Promise<SubmitOrderResult> {
    if (items.length === 0) {
        throw new Error("EMPTY_CART");
    }

    const body: Record<string, unknown> = { items };
    if (notes !== undefined) body.notes = notes;
    if (targetGroupId !== undefined) body.target_group_id = targetGroupId;

    const { data, error } = await supabase.functions.invoke<SubmitOrderResult>(
        "submit-order",
        {
            body,
            headers: { Authorization: `Bearer ${customerJwt}` }
        }
    );

    if (error) {
        const { status, code, details, rawMessage, reason } = await parseInvokeError(error);

        if (status === 400) throw new Error("Richiesta non valida");
        if (status === 401) {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 404 && code === "SESSION_NOT_FOUND") {
            throw new Error("Sessione non trovata");
        }
        if (status === 409 && code === "SESSION_EXPIRED") {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 409 && code === "GROUP_CONFLICT") {
            throw new Error("Conflitto sul gruppo ordine, riprova");
        }
        if (status === 422 && code === "INVALID_ITEMS") {
            const err = new Error("INVALID_ITEMS");
            (err as Error & { details?: unknown }).details = details;
            throw err;
        }
        if (status === 423 && code === "ORDERING_UNAVAILABLE") {
            // Maintenance mode mid-session. Espone `reason` come property
            // enumerable cosi il caller (CollectionView) puo customizzare il
            // messaggio (es. "Il ristorante ha sospeso gli ordini QR" vs
            // generico).
            const err = new Error(rawMessage ?? "ORDERING_UNAVAILABLE");
            (err as Error & { code?: string; reason?: string }).code = "ORDERING_UNAVAILABLE";
            (err as Error & { code?: string; reason?: string }).reason = reason;
            throw err;
        }
        if (status === 429) {
            throw new Error("Troppe richieste, riprova tra un momento");
        }
        throw new Error("Errore del server");
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Recupera tutti gli ordini della sessione corrente del customer.
 * Include items embedded e info tavolo.
 *
 * Throws:
 *   401, 404 SESSION_NOT_FOUND, 409 SESSION_EXPIRED, 429, 500 → italiano
 */
export async function getOrdersForSession(
    customerJwt: string
): Promise<GetOrdersForSessionResult> {
    const { data, error } = await supabase.functions.invoke<GetOrdersForSessionResult>(
        "get-orders-for-session",
        {
            body: {},
            headers: { Authorization: `Bearer ${customerJwt}` }
        }
    );

    if (error) {
        const { status, code } = await parseInvokeError(error);

        if (status === 401) {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 404 && code === "SESSION_NOT_FOUND") {
            throw new Error("Sessione non trovata");
        }
        if (status === 409 && code === "SESSION_EXPIRED") {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 429) {
            throw new Error("Troppe richieste, riprova tra un momento");
        }
        throw new Error("Errore del server");
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Cancella un ordine proprio (solo se ancora in status `submitted`).
 *
 * Throws:
 *   400, 401, 403 FORBIDDEN, 404 ORDER_NOT_FOUND, 404 SESSION_NOT_FOUND,
 *   409 SESSION_EXPIRED → italiano
 *   409 INVALID_STATE_TRANSITION → "INVALID_STATE_TRANSITION" (raw + details)
 *   429, 500 → italiano
 */
export async function cancelOrderCustomer(
    customerJwt: string,
    orderId: string
): Promise<CancelOrderCustomerResult> {
    const { data, error } = await supabase.functions.invoke<CancelOrderCustomerResult>(
        "cancel-order",
        {
            body: { order_id: orderId },
            headers: { Authorization: `Bearer ${customerJwt}` }
        }
    );

    if (error) {
        const { status, code, details } = await parseInvokeError(error);

        if (status === 400) throw new Error("Richiesta non valida");
        if (status === 401) {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 403 && code === "FORBIDDEN") {
            throw new Error("Non puoi cancellare questo ordine");
        }
        if (status === 404 && code === "ORDER_NOT_FOUND") {
            throw new Error("Ordine non trovato");
        }
        if (status === 404 && code === "SESSION_NOT_FOUND") {
            throw new Error("Sessione non trovata");
        }
        if (status === 409 && code === "SESSION_EXPIRED") {
            throw new Error("Sessione scaduta, scansiona di nuovo il QR");
        }
        if (status === 409 && code === "INVALID_STATE_TRANSITION") {
            const err = new Error("INVALID_STATE_TRANSITION");
            (err as Error & { details?: unknown }).details = details;
            throw err;
        }
        if (status === 429) {
            throw new Error("Troppe richieste, riprova tra un momento");
        }
        throw new Error("Errore del server");
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

// ═══════════════════════════════════════════════════════════════
// ADMIN-SIDE (Supabase user JWT)
// ═══════════════════════════════════════════════════════════════

/**
 * Lista ordini di una sede. SELECT diretto via RLS authenticated.
 *
 * Filtri opzionali via `options`. Default: tutti gli ordini, items embedded,
 * limit 100, ordinati per submitted_at DESC.
 *
 * Normalizza total_amount e items[*].(unit_price_snapshot|line_total) da
 * string (numeric Postgres) a number.
 */
export async function listOrdersForActivity(
    tenantId: string,
    activityId: string,
    options?: ListOrdersOptions
): Promise<V2OrderWithItems[]> {
    const includeItems = options?.includeItems !== false;
    const limit = options?.limit ?? 100;
    const select = includeItems ? "*, items:order_items(*)" : "*";

    let query = supabase
        .from("orders")
        .select(select)
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .order("submitted_at", { ascending: false })
        .limit(limit);

    if (options?.status) {
        if (Array.isArray(options.status)) {
            query = query.in("status", options.status);
        } else {
            query = query.eq("status", options.status);
        }
    }
    if (options?.tableId) query = query.eq("table_id", options.tableId);
    if (options?.dateFrom) query = query.gte("submitted_at", options.dateFrom);
    if (options?.dateTo) query = query.lte("submitted_at", options.dateTo);

    const { data, error } = await query;
    if (error) throw error;

    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => {
        const normalized: Record<string, unknown> = {
            ...row,
            total_amount: Number(row.total_amount)
        };
        if (includeItems) {
            const rawItems = row.items as V2OrderItem[] | undefined;
            normalized.items = (rawItems ?? []).map(item => ({
                ...item,
                unit_price_snapshot: Number(item.unit_price_snapshot),
                line_total: Number(item.line_total)
            }));
        }
        return normalized as unknown as V2OrderWithItems;
    });
}

/**
 * Transizione submitted → acknowledged. Optimistic locking via expected_version.
 *
 * Throws:
 *   400/401/403/404 ORDER_NOT_FOUND/429/500 → italiano
 *   409 INVALID_STATE_TRANSITION:
 *     - details.reason === "OPTIMISTIC_LOCK_CONFLICT" →
 *       throw Error("OPTIMISTIC_LOCK_CONFLICT")
 *     - altrimenti → throw Error("INVALID_STATE_TRANSITION") con
 *       extension .details (InvalidStateTransitionErrorDetails)
 */
export async function acknowledgeOrder(
    orderId: string,
    expectedVersion: number
): Promise<AcknowledgeOrderResult> {
    const { data, error } = await supabase.functions.invoke<AcknowledgeOrderResult>(
        "acknowledge-order",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione acknowledged → ready. Optimistic locking via expected_version.
 * Stesso mapping errori di acknowledgeOrder. Mirror 1:1 dell'Edge Function
 * `mark-order-ready` (Step 4a), che usa `performAdminOrderTransition` con
 * `source_status='acknowledged' → target_status='ready'` e popola `ready_at`.
 */
export async function markOrderReady(
    orderId: string,
    expectedVersion: number
): Promise<MarkOrderReadyResult> {
    const { data, error } = await supabase.functions.invoke<MarkOrderReadyResult>(
        "mark-order-ready",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione (acknowledged|ready) → delivered. Optimistic locking via
 * expected_version. Stesso mapping errori di acknowledgeOrder. Lato server
 * `deliver-order` accetta entrambi gli stati sorgente (Step 4a) cosi i
 * workflow che saltano lo step "ready" continuano a funzionare.
 */
export async function deliverOrder(
    orderId: string,
    expectedVersion: number
): Promise<DeliverOrderResult> {
    const { data, error } = await supabase.functions.invoke<DeliverOrderResult>(
        "deliver-order",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione admin → cancelled (da submitted o acknowledged). Optimistic locking.
 * Reason opzionale, trim, max 500 char.
 *
 * Throws (validation client):
 *   "REASON_TOO_LONG" se reason > 500 char dopo trim
 *
 * Throws (Edge):
 *   stesso pattern di acknowledgeOrder.
 */
export async function cancelOrderAdmin(
    orderId: string,
    expectedVersion: number,
    reason?: string
): Promise<CancelOrderAdminResult> {
    let normalizedReason: string | null = null;
    if (reason !== undefined) {
        const trimmed = reason.trim();
        if (trimmed.length > 500) throw new Error("REASON_TOO_LONG");
        if (trimmed.length > 0) normalizedReason = trimmed;
    }

    const body: Record<string, unknown> = {
        order_id: orderId,
        expected_version: expectedVersion
    };
    if (normalizedReason !== null) body.reason = normalizedReason;

    const { data, error } = await supabase.functions.invoke<CancelOrderAdminResult>(
        "cancel-order-admin",
        { body }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione delivered → acknowledged (ripristino post-servito).
 * Optimistic locking via expected_version. Mirror 1:1 dell'Edge Function
 * `restore-order` (Step 5a): resetta `delivered_at` + `ready_at` a null,
 * nessun timestamp dedicato di ripristino. Stesso mapping errori di
 * acknowledgeOrder.
 */
export async function restoreOrder(
    orderId: string,
    expectedVersion: number
): Promise<RestoreOrderResult> {
    const { data, error } = await supabase.functions.invoke<RestoreOrderResult>(
        "restore-order",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione acknowledged → submitted ("Rimetti in Nuove"). Optimistic
 * locking via expected_version. Mirror 1:1 dell'Edge Function
 * `unacknowledge-order`: azzera `acknowledged_at`. Stesso mapping
 * errori di acknowledgeOrder.
 */
export async function unacknowledgeOrder(
    orderId: string,
    expectedVersion: number
): Promise<UnacknowledgeOrderResult> {
    const { data, error } = await supabase.functions.invoke<UnacknowledgeOrderResult>(
        "unacknowledge-order",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione ready → acknowledged ("Rimetti in lavorazione"). Optimistic
 * locking via expected_version. Mirror 1:1 dell'Edge Function
 * `unready-order`: azzera `ready_at`, NON tocca `acknowledged_at`.
 * Stesso mapping errori di acknowledgeOrder.
 */
export async function unreadyOrder(
    orderId: string,
    expectedVersion: number
): Promise<UnreadyOrderResult> {
    const { data, error } = await supabase.functions.invoke<UnreadyOrderResult>(
        "unready-order",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione delivered → ready (undo "Servita" quando l'ordine
 * veniva dalla colonna Pronte). Optimistic locking via
 * expected_version. Mirror 1:1 dell'Edge Function `undeliver-to-ready`:
 * azzera `delivered_at`, lascia `ready_at` intatto. Stesso mapping
 * errori di acknowledgeOrder.
 */
export async function undeliverToReady(
    orderId: string,
    expectedVersion: number
): Promise<UndeliverToReadyResult> {
    const { data, error } = await supabase.functions.invoke<UndeliverToReadyResult>(
        "undeliver-to-ready",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione cancelled → submitted (undo immediato di "Elimina" su
 * un ordine che era in stato submitted). Optimistic locking via
 * expected_version. Azzera cancelled_at/by/reason. Stesso mapping
 * errori di acknowledgeOrder.
 */
export async function uncancelToSubmitted(
    orderId: string,
    expectedVersion: number
): Promise<UncancelToSubmittedResult> {
    const { data, error } = await supabase.functions.invoke<UncancelToSubmittedResult>(
        "uncancel-to-submitted",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione cancelled → acknowledged (undo immediato di "Elimina" su
 * un ordine che era in stato acknowledged). Optimistic locking via
 * expected_version. Azzera cancelled_at/by/reason; acknowledged_at
 * resta popolato.
 */
export async function uncancelToAcknowledged(
    orderId: string,
    expectedVersion: number
): Promise<UncancelToAcknowledgedResult> {
    const { data, error } = await supabase.functions.invoke<UncancelToAcknowledgedResult>(
        "uncancel-to-acknowledged",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Transizione cancelled → ready (undo immediato di "Elimina" su un
 * ordine che era in stato ready). Optimistic locking via
 * expected_version. Azzera cancelled_at/by/reason; acknowledged_at e
 * ready_at restano popolati.
 */
export async function uncancelToReady(
    orderId: string,
    expectedVersion: number
): Promise<UncancelToReadyResult> {
    const { data, error } = await supabase.functions.invoke<UncancelToReadyResult>(
        "uncancel-to-ready",
        { body: { order_id: orderId, expected_version: expectedVersion } }
    );

    if (error) {
        throwMappedTransitionError(await parseInvokeError(error));
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Rettifica parziale di un ordine: crea un nuovo ordine "storno" che
 * sottrae quantità da items specifici dell'ordine parent.
 *
 * Constraint server-side:
 *   - parent must be in status acknowledged | delivered
 *   - parent must NOT be a rectification itself
 *   - storno quantity <= residuo stornabile per ogni item
 *     (originale meno storni precedenti non annullati, cumulativo)
 *
 * Throws (validation client):
 *   "EMPTY_RECTIFICATION"           se items.length === 0
 *   "INVALID_RECTIFICATION_QUANTITY" se item.quantity non int positivo
 *   "REASON_TOO_LONG"               se reason > 500 char dopo trim
 *
 * Throws (Edge):
 *   400/401/403/404 PARENT_ORDER_NOT_FOUND/429/500 → italiano
 *   422 INVALID_PARENT          → "INVALID_PARENT" (parent è già rettifica)
 *   422 INVALID_PARENT_STATE    → "INVALID_PARENT_STATE" + .details.current_status
 *   422 INVALID_ITEMS           → "INVALID_RECTIFICATION_ITEMS" + .details
 *                                 (reason: INVALID_STORNO_ITEM |
 *                                 ORDER_ITEM_NOT_FOUND |
 *                                 STORNO_QTY_EXCEEDS_RESIDUAL)
 */
export async function rectifyOrder(
    parentOrderId: string,
    items: RectifyOrderItem[],
    reason?: string
): Promise<RectifyOrderResult> {
    if (items.length === 0) throw new Error("EMPTY_RECTIFICATION");
    for (const item of items) {
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new Error("INVALID_RECTIFICATION_QUANTITY");
        }
    }
    let normalizedReason: string | null = null;
    if (reason !== undefined) {
        const trimmed = reason.trim();
        if (trimmed.length > 500) throw new Error("REASON_TOO_LONG");
        if (trimmed.length > 0) normalizedReason = trimmed;
    }

    const body: Record<string, unknown> = {
        parent_order_id: parentOrderId,
        items_to_storno: items
    };
    if (normalizedReason !== null) body.reason = normalizedReason;

    const { data, error } = await supabase.functions.invoke<RectifyOrderResult>(
        "rectify-order",
        { body }
    );

    if (error) {
        const { status, code, details } = await parseInvokeError(error);
        switch (status) {
            case 400:
                throw new Error("Richiesta non valida");
            case 401:
                throw new Error("Sessione scaduta, accedi di nuovo");
            case 403:
                throw new Error("Non hai i permessi per questa operazione");
            case 404:
                if (code === "PARENT_ORDER_NOT_FOUND") throw new Error("Ordine non trovato");
                throw new Error("Risorsa non trovata");
            case 422: {
                if (code === "INVALID_PARENT") throw new Error("INVALID_PARENT");
                if (code === "INVALID_PARENT_STATE") {
                    const err = new Error("INVALID_PARENT_STATE");
                    (err as Error & { details?: unknown }).details = details;
                    throw err;
                }
                if (code === "INVALID_ITEMS") {
                    const err = new Error("INVALID_RECTIFICATION_ITEMS");
                    (err as Error & { details?: unknown }).details = details;
                    throw err;
                }
                throw new Error("Richiesta non valida");
            }
            case 429:
                throw new Error("Troppe richieste, riprova tra un momento");
            default:
                throw new Error("Errore del server");
        }
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Esito di un annullamento per-articolo (soft-cancel pre-servizio).
 */
export interface CancelOrderItemResult {
    order_id: string;
    item_id: string;
    new_order_total: number;
    order_cancelled: boolean;
}

/**
 * Annulla (soft-cancel) un singolo articolo di una comanda NON servita
 * (submitted | acknowledged | ready), SENZA creare uno storno. La riga viene
 * flaggata (esclusa da totale e preparazione) e il totale ordine ridotto del
 * suo line_total; se non resta nessuna riga attiva l'ordine si auto-annulla.
 *
 * Mirror di `rectifyOrder`: invoca l'edge `cancel-order-item` (membership +
 * RPC atomica server-side). `tenantId` è parte della firma per simmetria con
 * gli altri call admin; il tenant effettivo è derivato server-side dall'ordine.
 *
 * Throws (validation client):
 *   "REASON_TOO_LONG"              se reason > 500 char dopo trim
 *
 * Throws (Edge):
 *   400/401/403/404 ORDER_NOT_FOUND/429/500 → italiano
 *   422 INVALID_TARGET            → "INVALID_TARGET" (item di una rettifica)
 *   422 INVALID_STATE_FOR_CANCEL  → "INVALID_STATE_FOR_CANCEL" + .details.current_status
 *   422 INVALID_ITEM              → "INVALID_CANCEL_ITEM" + .details
 *                                   (reason: ITEM_NOT_FOUND | ITEM_ALREADY_CANCELLED)
 */
export async function cancelOrderItem(
    orderId: string,
    itemId: string,
    _tenantId: string,
    reason?: string
): Promise<CancelOrderItemResult> {
    let normalizedReason: string | null = null;
    if (reason !== undefined) {
        const trimmed = reason.trim();
        if (trimmed.length > 500) throw new Error("REASON_TOO_LONG");
        if (trimmed.length > 0) normalizedReason = trimmed;
    }

    const body: Record<string, unknown> = {
        order_id: orderId,
        order_item_id: itemId
    };
    if (normalizedReason !== null) body.reason = normalizedReason;

    const { data, error } = await supabase.functions.invoke<CancelOrderItemResult>(
        "cancel-order-item",
        { body }
    );

    if (error) {
        const { status, code, details } = await parseInvokeError(error);
        switch (status) {
            case 400:
                throw new Error("Richiesta non valida");
            case 401:
                throw new Error("Sessione scaduta, accedi di nuovo");
            case 403:
                throw new Error("Non hai i permessi per questa operazione");
            case 404:
                if (code === "ORDER_NOT_FOUND") throw new Error("Ordine non trovato");
                throw new Error("Risorsa non trovata");
            case 422: {
                if (code === "INVALID_TARGET") throw new Error("INVALID_TARGET");
                if (code === "INVALID_STATE_FOR_CANCEL") {
                    const err = new Error("INVALID_STATE_FOR_CANCEL");
                    (err as Error & { details?: unknown }).details = details;
                    throw err;
                }
                if (code === "INVALID_ITEM") {
                    const err = new Error("INVALID_CANCEL_ITEM");
                    (err as Error & { details?: unknown }).details = details;
                    throw err;
                }
                throw new Error("Richiesta non valida");
            }
            case 429:
                throw new Error("Troppe richieste, riprova tra un momento");
            default:
                throw new Error("Errore del server");
        }
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

/**
 * Submit di una comanda manuale inserita da un operatore admin (es. cameriere)
 * su un tavolo specifico. Mirror della pipeline customer `submitOrder` con auth
 * Supabase user standard invece di JWT customer custom.
 *
 * `tenant_id` e `activity_id` vengono derivati lato server dal `table_id` —
 * il client passa solo il `table_id`.
 *
 * Throws (validation client):
 *   "EMPTY_CART" se items.length === 0
 *
 * Throws (Edge):
 *   400 INVALID_REQUEST     → "Richiesta non valida"
 *   401 UNAUTHORIZED        → "Sessione scaduta, accedi di nuovo"
 *   403 FORBIDDEN           → "Non hai i permessi per registrare comande su questa sede"
 *   404 TABLE_NOT_FOUND     → "Tavolo non trovato"
 *   409 GROUP_CONFLICT      → "Conflitto sul gruppo ordine, riprova"
 *   422 INVALID_ITEMS       → throw Error("INVALID_ITEMS") con extension `details`
 *                             (InvalidItemsErrorDetails)
 *   423 ORDERING_UNAVAILABLE → throw Error(rawMessage) con extension `code` +
 *                              `reason` (subscription_inactive | tenant_deleted |
 *                              activity_inactive | table_maintenance | table_deleted)
 *   429 RATE_LIMITED        → "Troppe richieste, riprova tra un momento"
 *   500                     → "Errore del server"
 */
export async function submitOrderAdmin(
    tableId: string,
    items: OrderItemRequest[],
    notes?: string,
    customerLabel?: string
): Promise<SubmitOrderResult> {
    if (items.length === 0) {
        throw new Error("EMPTY_CART");
    }

    const body: Record<string, unknown> = {
        table_id: tableId,
        items,
        notes: notes ?? null,
        customer_label: customerLabel ?? null
    };

    const { data, error } = await supabase.functions.invoke<SubmitOrderResult>(
        "submit-order-admin",
        { body }
    );

    if (error) {
        const { status, code, details, rawMessage, reason } = await parseInvokeError(error);

        if (status === 400) throw new Error("Richiesta non valida");
        if (status === 401) {
            throw new Error("Sessione scaduta, accedi di nuovo");
        }
        if (status === 403) {
            throw new Error("Non hai i permessi per registrare comande su questa sede");
        }
        if (status === 404 && code === "TABLE_NOT_FOUND") {
            throw new Error("Tavolo non trovato");
        }
        if (status === 409 && code === "GROUP_CONFLICT") {
            throw new Error("Conflitto sul gruppo ordine, riprova");
        }
        if (status === 422 && code === "INVALID_ITEMS") {
            const err = new Error("INVALID_ITEMS");
            (err as Error & { details?: unknown }).details = details;
            throw err;
        }
        if (status === 423 && code === "ORDERING_UNAVAILABLE") {
            const err = new Error(rawMessage ?? "ORDERING_UNAVAILABLE");
            (err as Error & { code?: string; reason?: string }).code = "ORDERING_UNAVAILABLE";
            (err as Error & { code?: string; reason?: string }).reason = reason;
            throw err;
        }
        if (status === 429) {
            throw new Error("Troppe richieste, riprova tra un momento");
        }
        throw new Error("Errore del server");
    }

    if (!data) throw new Error("EMPTY_RESPONSE");
    return data;
}

// ═══════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════

interface ParsedInvokeError {
    status: number | null;
    code: string | undefined;
    details: unknown;
    rawMessage: string | undefined;
    /** Solo per 423 ORDERING_UNAVAILABLE: reason maintenance (vedi OrderingStateReason). */
    reason: string | undefined;
}

/**
 * Estrae status, code, details da un errore di supabase.functions.invoke.
 * Idempotente sul body stream: legge .json() una sola volta.
 *
 * Comportamento:
 *   - Se error è FunctionsHttpError con context Response: tenta parsing JSON.
 *   - Se parsing fallisce o error non è FunctionsHttpError: ritorna default
 *     (status null, code undefined).
 *
 * Il consumer fa branching su status + code per costruire l'Error finale.
 */
async function parseInvokeError(error: unknown): Promise<ParsedInvokeError> {
    if (!(error instanceof FunctionsHttpError)) {
        return {
            status: null,
            code: undefined,
            details: undefined,
            rawMessage: undefined,
            reason: undefined
        };
    }
    const status = error.context?.status ?? null;
    try {
        const body = (await error.context.clone().json()) as {
            code?: unknown;
            details?: unknown;
            message?: unknown;
            reason?: unknown;
        };
        return {
            status,
            code: typeof body?.code === "string" ? body.code : undefined,
            details: body?.details,
            rawMessage: typeof body?.message === "string" ? body.message : undefined,
            reason: typeof body?.reason === "string" ? body.reason : undefined
        };
    } catch {
        return {
            status,
            code: undefined,
            details: undefined,
            rawMessage: undefined,
            reason: undefined
        };
    }
}

/**
 * Mapping comune per le 3 transizioni admin (acknowledge/deliver/cancel-admin).
 * Throws sempre — non ritorna mai. Marked `never` for control-flow narrowing.
 */
function throwMappedTransitionError(parsed: ParsedInvokeError): never {
    const { status, code, details } = parsed;
    switch (status) {
        case 400:
            throw new Error("Richiesta non valida");
        case 401:
            throw new Error("Sessione scaduta, accedi di nuovo");
        case 403:
            throw new Error("Non hai i permessi per questa operazione");
        case 404:
            if (code === "ORDER_NOT_FOUND") throw new Error("Ordine non trovato");
            throw new Error("Risorsa non trovata");
        case 409: {
            const d = details as { reason?: string } | undefined;
            if (d?.reason === "OPTIMISTIC_LOCK_CONFLICT") {
                throw new Error("OPTIMISTIC_LOCK_CONFLICT");
            }
            const err = new Error("INVALID_STATE_TRANSITION");
            (err as Error & { details?: unknown }).details = details;
            throw err;
        }
        case 429:
            throw new Error("Troppe richieste, riprova tra un momento");
        default:
            throw new Error("Errore del server");
    }
}

// ═══════════════════════════════════════════════════════════════
// REALTIME (customer-side)
// ═══════════════════════════════════════════════════════════════

/**
 * Subscribe a Realtime postgres_changes su `orders` della sessione
 * customer corrente. RLS policy "Customer select own orders" filtra
 * automaticamente per `customer_session_id` estratto dal JWT, quindi
 * il channel riceve SOLO eventi della sessione del JWT passato.
 *
 * Pattern: `setAuth(jwt)` swap auth contesto del singleton supabase
 * client (NON crea nuovo client) + subscribe a postgres_changes su
 * tabella orders. UPDATE cattura transitions di status (submitted →
 * acknowledged → delivered | cancelled). INSERT raro (admin crea
 * ordine per customer); DELETE non dovrebbe mai avvenire (cancel =
 * status update), incluso per safety.
 *
 * Caller responsabile cleanup: channel.unsubscribe() onmount.
 *
 * @returns RealtimeChannel handle per cleanup. Null se setup fallisce.
 */
export function subscribeToSessionOrders(
    customerJwt: string,
    callbacks: {
        onInsert?: (order: V2Order) => void;
        onUpdate?: (order: V2Order) => void;
        onDelete?: (orderId: string) => void;
        onError?: (error: Error) => void;
    }
): RealtimeChannel | null {
    try {
        // Swap JWT su singleton client (no riconnessione WS se gia aperto)
        supabase.realtime.setAuth(customerJwt);

        const channel = supabase
            .channel("session-orders-" + Date.now())
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "orders" },
                payload => {
                    if (payload.eventType === "INSERT" && callbacks.onInsert) {
                        callbacks.onInsert(payload.new as V2Order);
                    } else if (payload.eventType === "UPDATE" && callbacks.onUpdate) {
                        callbacks.onUpdate(payload.new as V2Order);
                    } else if (payload.eventType === "DELETE" && callbacks.onDelete) {
                        const oldId = (payload.old as { id?: string })?.id;
                        if (oldId) callbacks.onDelete(oldId);
                    }
                }
            )
            .subscribe((status, err) => {
                if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
                    callbacks.onError?.(
                        err instanceof Error
                            ? err
                            : new Error("Realtime channel error: " + status)
                    );
                }
            });

        return channel;
    } catch (err) {
        callbacks.onError?.(
            err instanceof Error ? err : new Error("Realtime subscribe failed")
        );
        return null;
    }
}

// ─── KPI helpers ──────────────────────────────────────────────────────────

/**
 * Inizio della giornata operativa "oggi" come ISO timestamp.
 * Server-side via RPC `get_operative_day_start()` (DST-aware Europe/Rome,
 * migration 20260601150000). TODO multi-region: parametrizzare il timezone
 * via `activities.iana_timezone` nella RPC.
 */
export async function fetchOperativeDayStartIso(): Promise<string> {
    const { data, error } = await supabase.rpc("get_operative_day_start");
    if (error) throw error;
    if (typeof data !== "string") {
        throw new Error("get_operative_day_start returned non-string");
    }
    return data;
}

/**
 * Conta ordini con `submitted_at >= start_of_today_Europe/Rome`. Per KPI bar.
 * Non scarica row dati, usa COUNT lato Postgres.
 */
export async function getOrdersCountToday(
    tenantId: string,
    activityId: string
): Promise<number> {
    const fromIso = await fetchOperativeDayStartIso();
    const { count, error } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .gte("submitted_at", fromIso);
    if (error) throw error;
    return count ?? 0;
}

/**
 * Lista ordini con `status='delivered' AND delivered_at >= start_of_today`.
 * Per KPI tempo medio + count "servite oggi". Non include items (overhead inutile).
 */
export async function getOrdersServedToday(
    tenantId: string,
    activityId: string
): Promise<V2Order[]> {
    const fromIso = await fetchOperativeDayStartIso();
    const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .eq("status", "delivered")
        .gte("delivered_at", fromIso);
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => ({
        ...row,
        total_amount: Number(row.total_amount)
    })) as unknown as V2Order[];
}

/**
 * Storico ordini della giornata operativa per una sede: delivered + cancelled
 * con timestamp di uscita >= start_of_today (Europe/Rome, DST-aware via RPC).
 *
 * Filtra esplicitamente tenant_id + activity_id oltre alla RLS, in modo che
 * un bug futuro nelle policy non possa esporre storico cross-tenant o cross-
 * activity (defense in depth).
 *
 * Ordinamento: `updated_at DESC` — coincide con `delivered_at` per ordini
 * serviti e con `cancelled_at` per ordini annullati (parent di rettifiche
 * non viene mutato; rectify-order crea una nuova riga `is_rectification`).
 *
 * Include items (il drawer dettaglio li richiede). Limite alto (200) per
 * coprire la giornata operativa di una singola sede.
 */
export async function listOrdersHistoryToday(
    tenantId: string,
    activityId: string
): Promise<V2OrderWithItems[]> {
    const fromIso = await fetchOperativeDayStartIso();
    const { data, error } = await supabase
        .from("orders")
        .select("*, items:order_items(*)")
        .eq("tenant_id", tenantId)
        .eq("activity_id", activityId)
        .or(
            `and(status.eq.delivered,delivered_at.gte.${fromIso}),` +
                `and(status.eq.cancelled,cancelled_at.gte.${fromIso})`
        )
        .order("updated_at", { ascending: false })
        .limit(200);
    if (error) throw error;
    return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(row => {
        const rawItems = row.items as V2OrderItem[] | undefined;
        return {
            ...row,
            total_amount: Number(row.total_amount),
            items: (rawItems ?? []).map(item => ({
                ...item,
                unit_price_snapshot: Number(item.unit_price_snapshot),
                line_total: Number(item.line_total)
            }))
        } as unknown as V2OrderWithItems;
    });
}
