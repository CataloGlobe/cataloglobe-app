// "Questo prodotto estratto dall'AI ha un prezzo?" — logica pura, colocata e
// testabile in isolamento (i test Vitest girano in `environment: node` e non
// possono importare alberi UI .tsx).
//
// Stessa semantica di `hasConfiguredPrice` (dashboard, su ProductListMetadata)
// e di `hasOrderablePrice` (pagina pubblica, sul payload risolto): quando il
// prodotto ha dei formati, sono i formati a decidere e `base_price` NON è un
// fallback; basta UN formato prezzato perché il prodotto abbia un prezzo.
// La forma del dato è la terza — qui i formati sono ancora l'array grezzo
// dell'estrazione — quindi la funzione è separata, non un adapter.

export type AiPriceableProduct = {
    base_price?: number | null;
    formats?: Array<{ price?: number | null }> | null;
};

function isUsablePrice(price: number | null | undefined): boolean {
    return typeof price === "number" && Number.isFinite(price);
}

/**
 * Il prodotto ha almeno un prezzo utilizzabile.
 *
 * Un prodotto a formati con un solo formato prezzato ha un prezzo: è
 * ordinabile, e il campo vuoto dell'altro formato si segnala da sé.
 */
export function aiProductHasPrice(product: AiPriceableProduct): boolean {
    const formats = product.formats ?? [];
    if (formats.length > 0) {
        return formats.some(format => isUsablePrice(format.price));
    }
    return isUsablePrice(product.base_price);
}

export function aiProductMissesPrice(product: AiPriceableProduct): boolean {
    return !aiProductHasPrice(product);
}

/**
 * Vista "prezzabile" di un prodotto estratto, allineata al write path: i
 * formati contano solo per un `product_type: "formats"`, perché è l'unico caso
 * in cui `buildImportManifest` li scrive (un "simple" con dei formati appesi —
 * output AI malformato — finisce in DB col solo `base_price`).
 */
export function toAiPriceableProduct(product: {
    product_type: "simple" | "formats";
    base_price: number | null;
    formats?: Array<{ price?: number | null }> | null;
}): AiPriceableProduct {
    return {
        base_price: product.base_price,
        formats: product.product_type === "formats" ? product.formats : null
    };
}

export function countAiProductsWithoutPrice(products: AiPriceableProduct[]): number {
    return products.filter(aiProductMissesPrice).length;
}
