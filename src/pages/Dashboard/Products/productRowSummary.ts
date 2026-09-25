import { formatCurrency } from "@/utils/formatCurrency";
import type { ProductListMetadata } from "@/services/supabase/products";

/**
 * La riga muta di un prodotto nell'elenco (lotto Prodotti P3, §50.9/1):
 * «€ 4,50 · in 2 menù». Logica pura, condivisa da lista e griglia (prima la
 * stessa catena di prezzo era scritta tre volte: colonna Prezzo, card, card
 * della variante).
 *
 * Il «ha un prezzo?» resta a `getProductIssues`: qui si decide solo COME
 * dirlo, e la riga dice «senza prezzo» quando lui dice che manca.
 */

type PriceSource = { base_price: number | null };

export type PriceText =
    | { kind: "none" }
    | { kind: "price"; text: string; inherited: boolean };

/** Prezzo mostrato: «da € 2,50» con più formati, «€ 2,90», o ereditato dal padre. */
export function describePrice(
    product: PriceSource,
    meta: ProductListMetadata,
    parent?: PriceSource | null,
    parentMeta?: ProductListMetadata | null
): PriceText {
    if (meta.pricedFormatsCount > 1 && meta.fromPrice !== null) {
        return { kind: "price", text: `da ${formatCurrency(meta.fromPrice)}`, inherited: false };
    }
    if (meta.pricedFormatsCount === 1 && meta.fromPrice !== null) {
        return { kind: "price", text: formatCurrency(meta.fromPrice), inherited: false };
    }
    if (product.base_price !== null) {
        return { kind: "price", text: formatCurrency(product.base_price), inherited: false };
    }
    if (parent) {
        const inherited = parentMeta?.fromPrice ?? parent.base_price;
        if (inherited !== null && inherited !== undefined) {
            const multi = (parentMeta?.pricedFormatsCount ?? 0) > 1;
            return { kind: "price", text: `${multi ? "da " : ""}${formatCurrency(inherited)}`, inherited: true };
        }
    }
    return { kind: "none" };
}

export type MenuLabels = { catalogLabel: string; catalogLabelPlural: string };

/**
 * «in 2 menù» · «in 1 catalogo» · «in nessun menù». Una variante senza
 * collegamenti propri vale quanto il padre (stessa ereditarietà di
 * `getProductIssues`).
 */
export function describeMenus(
    ownCount: number,
    labels: MenuLabels,
    parentCount?: number | null
): { text: string; none: boolean } {
    const count = ownCount > 0 ? ownCount : (parentCount ?? 0);
    const one = labels.catalogLabel.toLowerCase();
    const many = labels.catalogLabelPlural.toLowerCase();
    if (count === 0) return { text: `in nessun ${one}`, none: true };
    return { text: `in ${count} ${count === 1 ? one : many}`, none: false };
}

/** «3 formati» quando i formati sono più di uno; un formato solo è un prezzo. */
export function describeFormats(meta: ProductListMetadata): string | null {
    return meta.formatsCount > 1 ? `${meta.formatsCount} formati` : null;
}
