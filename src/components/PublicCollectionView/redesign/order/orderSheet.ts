import { pushSheetPage, type SheetPage } from "../sheets/sheetStack";

/**
 * Pagina di modifica di una riga di «Il tuo ordine» (`order-edit:<indice>:<piatto>`).
 * Il piatto sta nella chiave: dopo «Aggiorna» la riga può sommarsi a un'altra e
 * l'indice non indicare più lei, ma la pagina che scende mostra ancora il suo piatto.
 */
export const ORDER_EDIT_PREFIX = "order-edit:";

/** Da «Modifica»: la scheda del piatto entra a spinta, con «‹ Il tuo ordine». */
export function pushOrderLineEdit(index: number, productId: string, name: string): void {
    pushSheetPage({ key: `${ORDER_EDIT_PREFIX}${index}:${productId}`, title: name, size: "large", titleHidden: true });
}

export function editTargetKey(page: SheetPage): { index: number; productId: string } | null {
    if (!page.key.startsWith(ORDER_EDIT_PREFIX)) return null;
    const rest = page.key.slice(ORDER_EDIT_PREFIX.length);
    const colon = rest.indexOf(":");
    if (colon < 0) return null;
    const index = Number(rest.slice(0, colon));
    const productId = rest.slice(colon + 1);
    return Number.isInteger(index) && index >= 0 && productId ? { index, productId } : null;
}
