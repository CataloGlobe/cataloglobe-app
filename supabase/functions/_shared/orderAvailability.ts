// Disponibilità dei prodotti ordinati, senza dipendenze: importabile sia dalle
// Edge Function (Deno) sia dai test vitest (un import remoto qui romperebbe
// `tsc -b`).

/**
 * Prodotti richiesti che non si possono ordinare per la sede, dalle due fonti
 * di disponibilità:
 * - `activity_product_overrides` con `visible_override = false`: è quello che
 *   scrive il pannello (`updateActivityProductVisibility`). `mode = 'disable'`
 *   = «Non disponibile» (mostrato ma spento), `'hide'`/null = nascosto: in
 *   entrambi i casi il resolver pubblico non lo rende ordinabile, quindi
 *   nemmeno qui.
 * - `product_availability_overrides` con `available = false`: tabella legacy,
 *   scritta solo dall'edge `toggle-product-availability`. Resta controllata
 *   finché quell'edge esiste.
 *
 * Una variante eredita lo stato del padre: l'override del pannello sta sul
 * prodotto padre, e il resolver pubblico spegne il padre con tutte le sue
 * varianti. `parentByVariant` mappa variante → padre (dai link del catalogo).
 *
 * Restituisce gli id richiesti (non quelli dei padri), nell'ordine ricevuto.
 */
export function findUnavailableProductIds(
    requestedProductIds: ReadonlyArray<string>,
    parentByVariant: ReadonlyMap<string, string>,
    legacyRows: ReadonlyArray<{ product_id: string }>,
    activityRows: ReadonlyArray<{ product_id: string; visible_override: boolean | null }>
): string[] {
    const off = new Set<string>();
    for (const row of legacyRows) off.add(row.product_id);
    for (const row of activityRows) {
        if (row.visible_override === false) off.add(row.product_id);
    }
    return requestedProductIds.filter(id => {
        if (off.has(id)) return true;
        const parent = parentByVariant.get(id);
        return parent !== undefined && off.has(parent);
    });
}

/** Id da controllare negli override: i richiesti più i loro padri. */
export function availabilityLookupIds(
    requestedProductIds: ReadonlyArray<string>,
    parentByVariant: ReadonlyMap<string, string>
): string[] {
    const ids = new Set(requestedProductIds);
    for (const id of requestedProductIds) {
        const parent = parentByVariant.get(id);
        if (parent) ids.add(parent);
    }
    return Array.from(ids);
}
