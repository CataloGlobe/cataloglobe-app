// Logica pura della vista "Ingredienti" del drawer Gestisci disponibilità:
// aggregazione stato per ingrediente, filtri e dati per la ConfirmDialog bulk.
// Nessun import dal service layer (client Supabase) così i test la importano
// senza mock — i tipi replicano la shape minima di RenderableProduct.

/** Union identica a `ProductVisibilityState` di activeCatalog.ts. */
export type ProductVisibilityStateLike = "visible" | "hidden" | "unavailable";

/** Shape minima del prodotto del catalogo renderizzabile usata da questa logica. */
export type CatalogProductLike = {
    product_id: string;
    name: string;
    category_name?: string | null;
    visibility_state: ProductVisibilityStateLike;
};

export type ProductIngredientPair = {
    product_id: string;
    ingredient_id: string;
};

export type IngredientAggregateState =
    | "all_visible"
    | "all_hidden"
    | "all_unavailable"
    | "mixed"
    | "none";

export type IngredientVisibilityCounts = {
    visible: number;
    hidden: number;
    unavailable: number;
};

export type IngredientVisibilityRow = {
    ingredient_id: string;
    name: string;
    /** Prodotti collegati PRESENTI nel catalogo attivo (dedup, ordine catalogo). */
    productIds: string[];
    counts: IngredientVisibilityCounts;
    aggregate: IngredientAggregateState;
    /** true se almeno un prodotto collegato ha un override manuale attivo. */
    hasOverride: boolean;
};

export type IngredientFilterValue = "all" | "with_hidden" | "with_unavailable";

/**
 * Dedup dei prodotti catalogo per product_id (un prodotto può comparire in più
 * categorie dello stesso catalogo): vince la prima occorrenza (ordine catalogo).
 */
function dedupeCatalogProducts(products: CatalogProductLike[]): Map<string, CatalogProductLike> {
    const byId = new Map<string, CatalogProductLike>();
    for (const p of products) {
        if (!byId.has(p.product_id)) byId.set(p.product_id, p);
    }
    return byId;
}

function deriveAggregate(counts: IngredientVisibilityCounts): IngredientAggregateState {
    const total = counts.visible + counts.hidden + counts.unavailable;
    if (total === 0) return "none";
    if (counts.visible === total) return "all_visible";
    if (counts.hidden === total) return "all_hidden";
    if (counts.unavailable === total) return "all_unavailable";
    return "mixed";
}

/**
 * Costruisce le righe della tabella ingredienti incrociando lista ingredienti,
 * coppie product_ingredients e prodotti del catalogo attivo. Tutto client-side,
 * zero query aggiuntive oltre le due fetch lazy.
 *
 * - Coppie verso prodotti fuori dal catalogo attivo: ignorate.
 * - Ordine di input degli ingredienti preservato (il service ordina per nome).
 */
export function buildIngredientVisibilityRows(
    ingredients: Array<{ id: string; name: string }>,
    pairs: ProductIngredientPair[],
    products: CatalogProductLike[],
    overriddenProductIds: Set<string>
): IngredientVisibilityRow[] {
    const productById = dedupeCatalogProducts(products);

    // ingredient_id → set di product_id collegati e presenti nel catalogo.
    const linkedByIngredient = new Map<string, Set<string>>();
    for (const pair of pairs) {
        if (!productById.has(pair.product_id)) continue;
        let set = linkedByIngredient.get(pair.ingredient_id);
        if (!set) {
            set = new Set();
            linkedByIngredient.set(pair.ingredient_id, set);
        }
        set.add(pair.product_id);
    }

    // Ordine catalogo per i productIds di riga (Map preserva insertion order).
    const catalogOrder = Array.from(productById.keys());

    return ingredients.map(ingredient => {
        const linked = linkedByIngredient.get(ingredient.id);
        const productIds = linked ? catalogOrder.filter(id => linked.has(id)) : [];

        const counts: IngredientVisibilityCounts = { visible: 0, hidden: 0, unavailable: 0 };
        let hasOverride = false;
        for (const pid of productIds) {
            const state = productById.get(pid)!.visibility_state;
            counts[state] += 1;
            if (overriddenProductIds.has(pid)) hasOverride = true;
        }

        return {
            ingredient_id: ingredient.id,
            name: ingredient.name,
            productIds,
            counts,
            aggregate: deriveAggregate(counts),
            hasOverride
        };
    });
}

/**
 * Filtri aggregati della vista Ingredienti + ricerca sul nome.
 * - `with_hidden` / `with_unavailable`: almeno un prodotto collegato in quello
 *   stato (includono quindi anche i misti — "misto" non è una categoria
 *   esclusiva, è già coperto da entrambi gli altri due filtri).
 */
export function filterIngredientRows(
    rows: IngredientVisibilityRow[],
    filter: IngredientFilterValue,
    search: string
): IngredientVisibilityRow[] {
    const term = search.trim().toLowerCase();
    return rows.filter(row => {
        if (filter === "with_hidden" && row.counts.hidden === 0) return false;
        if (filter === "with_unavailable" && row.counts.unavailable === 0) return false;
        if (term && !row.name.toLowerCase().includes(term)) return false;
        return true;
    });
}

export type BulkPreviewItem = {
    product_id: string;
    name: string;
    caption: string | null;
};

export type BulkConfirmData = {
    /** Prodotti che riceveranno l'azione (dedup). */
    total: number;
    /** Prodotti con override manuale esistente che l'azione sovrascrive/rimuove. */
    overwrittenCount: number;
    /** Elenco completo per la preview (il chiamante tronca a 3 + "e altri N"). */
    preview: BulkPreviewItem[];
};

const STATE_LABEL: Record<ProductVisibilityStateLike, string> = {
    visible: "Reso visibile manualmente",
    hidden: "Nascosto manualmente",
    unavailable: "Non disponibile"
};

/**
 * Dati per la ConfirmDialog dell'azione bulk (tutte e 3 le destinazioni).
 *
 * - `overwrittenCount`: per hide/disable conta gli override esistenti con stato
 *   diverso dal target (stesso stato = riscrittura idempotente, non un
 *   sovrascritto da segnalare); per il ripristino a visible conta TUTTI gli
 *   override esistenti (verranno rimossi).
 * - `preview`: per il ripristino a visible i prodotti con override manuale
 *   vanno in testa con lo stato attuale come caption (è il punto rischioso da
 *   mostrare); per hide/disable ordine catalogo con la categoria come caption.
 */
export function buildBulkConfirmData(
    productIds: string[],
    products: CatalogProductLike[],
    overriddenProductIds: Set<string>,
    target: ProductVisibilityStateLike
): BulkConfirmData {
    const productById = dedupeCatalogProducts(products);
    const ids = Array.from(new Set(productIds)).filter(id => productById.has(id));

    let overwrittenCount = 0;
    for (const id of ids) {
        if (!overriddenProductIds.has(id)) continue;
        if (target === "visible" || productById.get(id)!.visibility_state !== target) {
            overwrittenCount += 1;
        }
    }

    const toItem = (id: string): BulkPreviewItem => {
        const p = productById.get(id)!;
        return {
            product_id: id,
            name: p.name,
            caption:
                target === "visible"
                    ? STATE_LABEL[p.visibility_state]
                    : (p.category_name ?? null)
        };
    };

    let orderedIds = ids;
    if (target === "visible") {
        const overridden = ids.filter(id => overriddenProductIds.has(id));
        const rest = ids.filter(id => !overriddenProductIds.has(id));
        orderedIds = [...overridden, ...rest];
    }

    return {
        total: ids.length,
        overwrittenCount,
        preview: orderedIds.map(toItem)
    };
}
