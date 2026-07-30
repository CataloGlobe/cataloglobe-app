// Logica pura del drawer di export PDF: messaggi e chiavi di cache.
// Colocata ma senza dipendenze UI (niente .tsx, niente .module.scss) così i
// test vitest possono importarla — vedi memory/feedback_vitest_aliases.md.
//
// `ALLERGEN_COVERAGE_THRESHOLD` arriva da un modulo di sole costanti: non
// trascina @react-pdf/renderer, il generatore resta dietro gli import dinamici.
import { ALLERGEN_COVERAGE_THRESHOLD } from "@/services/pdf/allergenEuNumbers";
import type { MenuPdfAllergenCoverage } from "@/services/pdf/menuPdfTypes";

/**
 * Avviso sulla copertura allergeni del catalogo selezionato. Descrittivo, mai
 * accusatorio: una copertura bassa può essere legittima (un catalogo di sole
 * bibite non ha allergeni da segnalare), quindi il testo dice cosa apparirà nel
 * PDF e lascia giudicare all'utente. `null` = niente da dire.
 *
 * I testi sono in revisione legale: sostituirli qui, i test asseriscono la
 * logica (quando c'è un messaggio, singolare vs plurale) non le frasi intere.
 */
export function buildAllergenCoverageMessage(
    coverage: MenuPdfAllergenCoverage
): string | null {
    const { productsTotal, productsWithAllergens } = coverage;
    if (productsTotal === 0) return null;
    if (productsWithAllergens / productsTotal >= ALLERGEN_COVERAGE_THRESHOLD) return null;

    if (productsWithAllergens === 0) {
        return "Nessun prodotto di questo catalogo ha allergeni assegnati: la pagina allergeni del PDF non indicherà quali sono presenti. Se è corretto così, puoi ignorare questo avviso.";
    }

    const verb = productsWithAllergens === 1 ? "ha" : "hanno";
    const noun = productsWithAllergens === 1 ? "prodotto" : "prodotti";
    return `Solo ${productsWithAllergens} ${noun} su ${productsTotal} ${verb} allergeni assegnati: la pagina allergeni del PDF segnalerà soltanto quelli compilati.`;
}

/**
 * Chiave della cache dei payload `MenuPdfData`. Include lo stile: `brand.tokens`
 * ne dipende, riusare un payload risolto su un altro stile produrrebbe un PDF
 * con la tematizzazione sbagliata.
 */
export function pdfDataCacheKey(catalogId: string, styleId: string): string {
    return `${catalogId}::${styleId}`;
}
