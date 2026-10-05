/**
 * Importo del prossimo rinnovo nell'anteprima di un cambio programmato
 * (`preview-scheduled-change` di stripe-change-subscription).
 *
 * Caso voluto, da non «correggere»: con un cambio già programmato, aggiungere
 * sedi «dal rinnovo» costa 0 € oggi (`chargeToday: 0`). Le sedi entrano solo
 * nella fase futura dello schedule e si pagano dal rinnovo, con l'importo
 * calcolato qui. Chi vuole le sedi subito sceglie «subito» e passa dal
 * percorso pagante normale (SubscriptionPage, `isSeatChoice`).
 *
 * Ciò che invece non deve succedere è un rinnovo a 0 € senza motivo:
 * - il totale dal listino (prezzo × sedi) a 0 con sedi > 0 vuol dire un
 *   prezzo configurato male, non un rinnovo gratis: si passa all'anteprima
 *   della fattura;
 * - l'anteprima della fattura può dare 0 per un motivo vero (sconto o coupon
 *   al 100%, come i mesi gratis della demo), quindi lì lo 0 si accetta;
 * - se l'anteprima non ha un totale, prima diventava 0: ora è un errore
 *   (`preview_failed`), meglio nessuna cifra che una cifra falsa.
 */

/** Totale dal listino usabile: un numero, e mai 0 se le sedi sono più di zero. */
export function isUsableListTotal(listTotal: number | null, quantity: number): listTotal is number {
    return typeof listTotal === "number" && (listTotal > 0 || quantity === 0);
}

/** Totale dell'anteprima fattura, o null se Stripe non l'ha dato. */
export function previewTotalOrNull(total: unknown): number | null {
    return typeof total === "number" && Number.isFinite(total) ? total : null;
}
