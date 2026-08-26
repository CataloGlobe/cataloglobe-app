// Menù compatto: partizione dei prodotti di una categoria in blocchi di
// impaginazione (righe piene / griglia affiancata a due colonne).
//
// Logica PURA, separata da MenuPdfDocument: nessun JSX, nessuno stile. Vive qui
// e non nel mapper perché dipende da scelte di RENDER (toggle "Menù compatto",
// photoMode) e non dal dato — `MenuPdfData` non ne sa nulla.

import type { MenuPdfProduct } from "./menuPdfTypes";

/** Colonne della griglia compatta (le celle rendono a width 50%). */
export const COMPACT_COLUMNS = 2;

/**
 * Voci nude consecutive necessarie perché una sequenza venga affiancata.
 *
 * Sotto questa lunghezza le voci restano a riga piena: due sole celle
 * affiancate in mezzo a un flusso di righe piene si leggono come
 * un'increspatura dell'impaginato, non come una scelta. Da qui in su
 * l'affiancamento dura abbastanza da sembrare una colonna vera.
 *
 * COSTANTE DA TARARE sul PDF reale: alzarla rende l'affiancamento più raro e
 * più riconoscibile, abbassarla comprime di più al prezzo di più stacchi.
 */
export const COMPACT_MIN_RUN = 4;

/**
 * Voce affiancabile: nessuna descrizione e nessun elenco formati.
 *
 * - Descrizione: `!description?.trim()` e NON `=== null` — il mapper lascia
 *   passare la stringa vuota e il render la tratta già come assenza.
 * - Formati: una voce multi-formato rende N `formatLine` extra, quindi è molto
 *   più alta di una voce nuda; affiancarle produrrebbe colonne sbilanciate.
 *   Interrompe la sequenza esattamente come una voce descritta.
 */
export function isCompactCandidate(product: MenuPdfProduct): boolean {
    return !product.description?.trim() && product.formats.length === 0;
}

/**
 * Blocco di impaginazione di una categoria: righe piene (come sempre) oppure
 * griglia affiancata a due colonne.
 */
export type CategoryBlock = {
    kind: "full" | "grid";
    products: MenuPdfProduct[];
};

/**
 * Partiziona i prodotti di una categoria in blocchi. Le sequenze di voci
 * affiancabili lunghe almeno COMPACT_MIN_RUN diventano griglie; tutto il resto
 * resta a riga piena.
 *
 * Nessuna soglia percentuale sulla categoria: conta solo la lunghezza della
 * sequenza. Una categoria a voci alternate una a una non produce quindi alcun
 * blocco e resta identica a oggi.
 */
export function buildCategoryBlocks(
    products: MenuPdfProduct[],
    compact: boolean
): CategoryBlock[] {
    if (products.length === 0) return [];
    if (!compact) return [{ kind: "full", products }];

    const blocks: CategoryBlock[] = [];
    // Righe piene contigue confluiscono in un unico blocco: il render le emette
    // come fratelli diretti, esattamente come prima di questa funzione.
    const pushFull = (items: MenuPdfProduct[]) => {
        if (items.length === 0) return;
        const last = blocks[blocks.length - 1];
        if (last?.kind === "full") last.products.push(...items);
        else blocks.push({ kind: "full", products: items });
    };

    let index = 0;
    while (index < products.length) {
        if (!isCompactCandidate(products[index])) {
            pushFull([products[index]]);
            index += 1;
            continue;
        }
        let end = index;
        while (end < products.length && isCompactCandidate(products[end])) end += 1;
        const run = products.slice(index, end);
        if (run.length >= COMPACT_MIN_RUN) blocks.push({ kind: "grid", products: run });
        else pushFull(run);
        index = end;
    }

    return blocks;
}
