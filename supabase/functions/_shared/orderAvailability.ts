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

/** Una riga di `catalog_category_products`, solo i campi che servono qui. */
export interface CatalogLinkRow {
    category_id: string | null;
    product_id: string;
    variant_product_id: string | null;
}

/**
 * Padri collegati in una categoria senza nessuna variante scelta: la pagina
 * pubblica mostra tutte le loro varianti (`resolveActivityCatalogs`, gruppo
 * con `selectedVariantIds` vuoto), quindi devono essere ordinabili tutte. È il
 * caso dei cataloghi legacy, con il solo padre collegato.
 * Il gruppo è (categoria, padre), come nel resolver.
 */
export function parentsWithAllVariants(rows: ReadonlyArray<CatalogLinkRow>): string[] {
    const groups = new Map<string, { parent: string; parentLinked: boolean; variants: number }>();
    for (const row of rows) {
        const key = `${row.category_id ?? ""}|${row.product_id}`;
        const group = groups.get(key) ?? { parent: row.product_id, parentLinked: false, variants: 0 };
        if (row.variant_product_id === null) group.parentLinked = true;
        else group.variants++;
        groups.set(key, group);
    }
    const parents = new Set<string>();
    for (const g of groups.values()) {
        if (g.parentLinked && g.variants === 0) parents.add(g.parent);
    }
    return Array.from(parents);
}

/**
 * Prodotti ordinabili dal catalogo: i padri e le varianti collegati, più tutte
 * le varianti dei padri in `parentsWithAllVariants` (`variantRows` = i prodotti
 * con quel `parent_product_id`). `parentByVariant` serve al controllo di
 * disponibilità: una variante segue il padre spento.
 */
export function buildOrderableProducts(
    rows: ReadonlyArray<CatalogLinkRow>,
    variantRows: ReadonlyArray<{ id: string; parent_product_id: string | null }>
): { ids: Set<string>; parentByVariant: Map<string, string> } {
    const ids = new Set<string>();
    const parentByVariant = new Map<string, string>();
    for (const row of rows) {
        ids.add(row.product_id);
        if (row.variant_product_id) {
            ids.add(row.variant_product_id);
            parentByVariant.set(row.variant_product_id, row.product_id);
        }
    }
    const openParents = new Set(parentsWithAllVariants(rows));
    for (const v of variantRows) {
        if (v.parent_product_id && openParents.has(v.parent_product_id)) {
            ids.add(v.id);
            parentByVariant.set(v.id, v.parent_product_id);
        }
    }
    return { ids, parentByVariant };
}
