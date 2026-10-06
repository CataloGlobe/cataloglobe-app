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

// ── Copy della vista Ingredienti (puro, fuori dal componente) ───────────────

/**
 * Il misto a parole, per la riga sotto il nome (V4): quanti prodotti non
 * seguono la regola o non sono visibili, su quanti. «1 nascosto su 3»,
 * «1 nascosto e 1 non disponibile su 3».
 */
export function mixedSummary(counts: IngredientVisibilityCounts): string {
    const total = counts.visible + counts.hidden + counts.unavailable;
    const parts = [
        counts.hidden > 0 ? `${counts.hidden} ${counts.hidden === 1 ? "nascosto" : "nascosti"}` : null,
        counts.unavailable > 0
            ? `${counts.unavailable} ${counts.unavailable === 1 ? "non disponibile" : "non disponibili"}`
            : null
    ].filter(Boolean);
    return `misto: ${parts.join(" e ")} su ${total}`;
}

export function productWord(count: number): string {
    return count === 1 ? "prodotto" : "prodotti";
}

/** Titolo, messaggio, bottone e avviso della conferma di un'azione in blocco. */
export function bulkConfirmCopy(
    target: ProductVisibilityStateLike,
    ingredientName: string,
    total: number,
    overwrittenCount: number
): { title: string; message: string; confirmLabel: string; warn: string | null } {
    const word = productWord(total);
    const overwriteSuffix =
        overwrittenCount > 0
            ? ` ${overwrittenCount} ${overwrittenCount === 1 ? "ha già una modifica a mano che verrà sovrascritta" : "hanno già una modifica a mano e verranno sovrascritti"}.`
            : "";

    switch (target) {
        case "hidden":
            return {
                title: `Nascondere ${total} ${word}?`,
                message: `Tutti i prodotti collegati a "${ingredientName}" verranno rimossi dalla pagina pubblica.${overwriteSuffix}`,
                confirmLabel: `Nascondi ${total} ${word}`,
                warn: null
            };
        case "unavailable":
            return {
                title: `Segnare ${total} ${word} come non disponibil${total === 1 ? "e" : "i"}?`,
                message: `I prodotti collegati a "${ingredientName}" resteranno in pagina come "Non disponibile".${overwriteSuffix}`,
                confirmLabel: "Segna non disponibili",
                warn: null
            };
        default:
            return {
                title: `Rendere visibil${total === 1 ? "e" : "i"} ${total} ${word}?`,
                message: `Le modifiche a mano sui prodotti collegati a "${ingredientName}" verranno tolte: i prodotti torneranno a seguire la programmazione.`,
                confirmLabel: `Rendi visibil${total === 1 ? "e" : "i"} ${total} ${word}`,
                warn:
                    overwrittenCount > 0
                        ? `${overwrittenCount} ${overwrittenCount === 1 ? "prodotto era stato modificato a mano — potrebbe esserlo per motivi non legati a questo ingrediente. Tornerà" : "prodotti erano stati modificati a mano — potrebbero esserlo per motivi non legati a questo ingrediente. Torneranno"} visibil${overwrittenCount === 1 ? "e" : "i"} al pubblico.`
                        : null
            };
    }
}

/** Il toast dopo un'azione in blocco riuscita. */
export function bulkSuccessMessage(target: ProductVisibilityStateLike, total: number): string {
    const word = productWord(total);
    switch (target) {
        case "hidden":
            return `${total} ${word} nascost${total === 1 ? "o" : "i"}.`;
        case "unavailable":
            return `${total} ${word} segnat${total === 1 ? "o" : "i"} come non disponibil${total === 1 ? "e" : "i"}.`;
        default:
            return `${total} ${word} res${total === 1 ? "o" : "i"} visibil${total === 1 ? "e" : "i"}.`;
    }
}
