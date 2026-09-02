// "Questo prodotto ha un prezzo?" — formulazione UNICA lato dashboard.
//
// Prima di questo file la stessa domanda era scritta in tre modi diversi:
// `row.price === null && row.from_price === null` (CatalogEngine), la catena
// di rendering della colonna Prezzo (Products) e — con la forma del payload
// pubblico — `hasOrderablePrice` in
// `src/components/PublicCollectionView/itemPricing.ts`.
//
// ⚠️ Rapporto con `itemPricing.ts`: le due funzioni rispondono alla STESSA
// domanda su DUE forme di dato diverse e restano volutamente separate.
// `itemPricing` lavora sul payload risolto del catalogo pubblico
// (`optionGroups[].values[].absolutePrice`, camelCase, ereditarietà già
// applicata dal resolver); qui si lavora su `ProductListMetadata`, dove i
// formati sono GIÀ aggregati in `pricedFormatsCount` (conteggio dei soli
// formati con `absolute_price` valido, da `resolvePriceSummary`). Un adapter
// fra le due forme costerebbe più di quanto renda. La semantica coincide:
// - esiste un gruppo PRIMARY_PRICE con almeno un valore prezzato → prezzato
//   (`pricedFormatsCount > 0`);
// - gruppo presente ma senza valori prezzati → NON prezzato: `base_price` non
//   è un fallback, esattamente come nel server e nel resolver pubblico;
// - nessun formato → decide `base_price`.
// L'unico ramo che qui non è rappresentabile è "gruppo PRIMARY_PRICE esistente
// ma con zero valori prezzati mentre `base_price` è valorizzato": il metadata
// non distingue "nessun gruppo" da "gruppo senza valori prezzati"
// (`pricedFormatsCount === 0` in entrambi i casi), quindi la dashboard
// considera prezzato un prodotto in quello stato mentre il gate pubblico lo
// rifiuta. È l'unica divergenza nota ed è conservativa nel verso giusto: non
// segnala mai come "senza prezzo" un prodotto ordinabile.

/** Fatti sul prezzo di un singolo prodotto, come li espone `ProductListMetadata` + la riga prodotto. */
export type ProductPriceFacts = {
    /** `products.base_price`. NULL per una variante che eredita dal padre. */
    basePrice: number | null | undefined;
    /** Formati con prezzo valido (`ProductListMetadata.pricedFormatsCount`). */
    pricedFormatsCount?: number | null;
};

/**
 * Il prodotto ha un prezzo configurato, guardato in isolamento.
 *
 * NON applica l'ereditarietà variante→padre: per una riga variante usare
 * `hasConfiguredEffectivePrice`.
 */
export function hasConfiguredPrice(facts: ProductPriceFacts): boolean {
    if ((facts.pricedFormatsCount ?? 0) > 0) return true;
    return typeof facts.basePrice === "number" && Number.isFinite(facts.basePrice);
}

/**
 * Prezzo effettivo di una riga variante: la variante senza prezzo proprio
 * eredita quello del padre, quindi non è "da configurare" se il padre è
 * prezzato. Con `parent` assente (prodotto base, o variante senza padre noto)
 * degrada a `hasConfiguredPrice`.
 */
export function hasConfiguredEffectivePrice(
    own: ProductPriceFacts,
    parent?: ProductPriceFacts | null
): boolean {
    if (hasConfiguredPrice(own)) return true;
    return parent != null && hasConfiguredPrice(parent);
}
