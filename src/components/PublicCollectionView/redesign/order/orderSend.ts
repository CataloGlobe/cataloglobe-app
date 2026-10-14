import type { SelectionItem } from "@/components/PublicCollectionView/OrderingSheet/OrderingSheet";
import type { OrderItemRequest, OrderStatus, OrderingStateReason } from "@/types/orders";

/**
 * Foglio «Il tuo ordine» del redesign (spec §7): cosa si manda alla cucina,
 * come si legge un errore dell'invio, a che punto è un ordine. Puro, provato
 * in `src/tests/publicRedesign/orderSend.test.ts`.
 */

/** «Note per la cucina» (mockup v38): 140 caratteri; il server ne accetta 300. */
export const ORDER_NOTE_MAX = 140;

/** Spazi ridotti come l'invio di oggi: «  ben   cotto » → «ben cotto». */
export function cleanNote(note: string | null | undefined): string | null {
    const clean = note?.trim().replace(/\s+/g, " ");
    return clean ? clean : null;
}

/** Le righe come le vuole `submitOrder` (stessa forma di `handleSubmitOrder`). */
export function orderRequest(
    selection: SelectionItem[],
    orderNote: string | null
): { items: OrderItemRequest[]; notes: string | undefined } {
    const items = selection.flatMap<OrderItemRequest>(line => {
        if (line.qty <= 0) return [];
        const note = cleanNote(line.note);
        return [
            {
                product_id: line.id,
                quantity: line.qty,
                ...(line.selectedFormat?.id ? { primary_option_value_id: line.selectedFormat.id } : {}),
                ...(line.selectedAddons && line.selectedAddons.length > 0
                    ? { addon_value_ids: line.selectedAddons.map(addon => addon.id) }
                    : {}),
                ...(note ? { item_notes: note } : {})
            }
        ];
    });
    return { items, notes: cleanNote(orderNote) ?? undefined };
}

/**
 * Un piatto che il menu non ha più, o che il locale ha spento, resta nell'ordine
 * marcato «Non più disponibile», con «Rimuovi» (spec §7): non si manda.
 */
export function isLineUnavailable(
    findProduct: (productId: string) => { is_disabled?: boolean | null } | null,
    line: Pick<SelectionItem, "id">,
    refused: ReadonlySet<string> = NONE_REFUSED
): boolean {
    if (refused.has(line.id)) return true;
    const item = findProduct(line.id);
    return !item || item.is_disabled === true;
}

const NONE_REFUSED: ReadonlySet<string> = new Set();

export const selectionTotal =(selection: SelectionItem[]): number =>
    selection.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

/** Cosa fare di un errore di `submitOrder` (stessi casi di `handleSubmitOrder`). */
export type SendFailure =
    | { kind: "maintenance"; reason: OrderingStateReason; message: string }
    | { kind: "closed"; message: string }
    | { kind: "session" }
    | { kind: "items"; productIds: string[] }
    | { kind: "empty" }
    | { kind: "other"; message: string | null };

/** Esito di `OrderingContext.send`: l'ordine creato, o cosa è andato storto. */
export type SendResult = { kind: "sent"; orderId: string } | SendFailure;

/** Pagina di conferma dopo l'invio (mockup v38, «Ordine N · Tavolo»): `order-sent:<id ordine>`. */
export const ORDER_SENT_PREFIX = "order-sent:";

export const orderSentIdOf = (key: string): string | null =>
    key.startsWith(ORDER_SENT_PREFIX) ? key.slice(ORDER_SENT_PREFIX.length) || null : null;

/**
 * I piatti che il server ha rifiutato (spenti o fuori menu dopo l'apertura della
 * pagina, che non si aggiorna da sola): servono a segnare le righe da togliere.
 */
function refusedProductIds(error: Error): string[] {
    const details = (error as Error & { details?: unknown }).details;
    if (!details || typeof details !== "object") return [];
    const { unavailable_product_ids, invalid_product_ids, invalid_items } = details as Record<string, unknown>;
    const fromItems = Array.isArray(invalid_items)
        ? invalid_items.map(item => (item && typeof item === "object" ? (item as { product_id?: unknown }).product_id : null))
        : [];
    const ids = [
        ...(Array.isArray(unavailable_product_ids) ? unavailable_product_ids : []),
        ...(Array.isArray(invalid_product_ids) ? invalid_product_ids : []),
        ...fromItems
    ];
    return [...new Set(ids.filter((id): id is string => typeof id === "string"))];
}

export function sendFailure(error: unknown): SendFailure {
    if (!(error instanceof Error)) return { kind: "other", message: null };
    const { message } = error;
    const { code, reason } = error as Error & { code?: string; reason?: OrderingStateReason };
    if (code === "ORDERING_UNAVAILABLE") return { kind: "maintenance", reason: reason ?? "ordering_disabled", message };
    if (code === "ORDERING_CLOSED") return { kind: "closed", message };
    if (message === "SESSION_EXPIRED" || message.toLowerCase().includes("scaduta")) return { kind: "session" };
    if (message === "INVALID_ITEMS") return { kind: "items", productIds: refusedProductIds(error) };
    if (message === "EMPTY_CART") return { kind: "empty" };
    return { kind: "other", message: message || null };
}

/**
 * Le etichette dei tavoli sono libere («6», «T5», «Tavolo 1»): «Tavolo» si
 * aggiunge solo davanti a un numero nudo, mai «Tavolo Tavolo 1».
 */
export const isBareTableNumber = (label: string): boolean => /^\d+$/.test(label.trim());

/** I quattro passi che il cliente vede (spec §7): Inviato, In cucina, Pronto, Servito. */
export const ORDER_STEPS = ["submitted", "acknowledged", "ready", "delivered"] as const;

/** Indice del passo; -1 per un ordine annullato. */
export const orderStep = (status: OrderStatus): number =>
    status === "cancelled" ? -1 : ORDER_STEPS.indexOf(status);

/** «Annulla ordine» solo finché la cucina non l'ha preso. */
export const canCancelOrder = (status: OrderStatus): boolean => status === "submitted";
