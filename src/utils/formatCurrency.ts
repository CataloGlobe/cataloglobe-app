// Fonte unica per la formattazione monetaria/decimale in locale italiano.
//
// Il progetto ha oggi ~20 `Intl.NumberFormat("it-IT")` dichiarati file per
// file (epic Ordini, Analitiche, billing) più diversi `toFixed(2)` inline
// (pagina pubblica, backoffice): convenzioni divergenti sullo stesso dato.
// Questo helper è il punto in cui la regola vive una volta sola; la
// migrazione delle altre superfici è tracciata in un task Notion dedicato —
// in questo step lo consuma solo la pipeline PDF.
//
// Nessuna dipendenza da React o da moduli pesanti: importabile ovunque,
// renderer react-pdf compreso.

/**
 * Formattatore decimale it-IT a 2 cifre fisse: virgola come separatore
 * decimale, punto per le migliaia ("1.234,50").
 *
 * NB: NON si usa `style: "currency"` perché produrrebbe "22,00 €" (simbolo
 * dopo il numero). La convenzione già in uso nel PDF è "€ 22,00" — simbolo
 * prima, spazio unico — quindi il simbolo lo antepone `formatCurrency`.
 */
const DECIMAL_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // CLDR dà a `it` minimumGroupingDigits=2: senza forzare, 1234.5 uscirebbe
    // "1234,50" (gruppo delle migliaia omesso sotto le 5 cifre intere).
    // Su un listino "1.234,50" è la forma attesa → grouping sempre attivo.
    useGrouping: true
});

/**
 * Numero decimale senza simbolo: `5.5` → `"5,50"`.
 * Serve dove l'unità non è una valuta anteposta (es. le fee del PDF, che
 * hanno unità testuali proprie come "€/persona").
 */
export function formatDecimal(value: number): string {
    return DECIMAL_FORMATTER.format(value);
}

/**
 * Importo monetario con simbolo anteposto: `22` → `"€ 22,00"`.
 * Il simbolo è parametrico (default euro) per i pochi call site che
 * formattano valute diverse.
 */
export function formatCurrency(value: number, currencySymbol = "€"): string {
    return `${currencySymbol} ${formatDecimal(value)}`;
}
