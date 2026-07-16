// ⚠️ SYNC: questo file è duplicato. L'altra copia è in
// src/utils/priceSummary.ts. Qualsiasi modifica va replicata in ENTRAMBI i
// file (stesso pattern di resolveActivityCatalogs.ts).
//
// Fonte unica per i "fatti" sul prezzo sintetico di un gruppo di valori
// (formati PRIMARY_PRICE, o prezzi di varianti già risolti a scalare).
// Non decide la presentazione ("da X" vs range vs altro) — quella resta
// lato frontend (formatPriceSummary in src/utils/), il resolver Deno usa
// solo questi fatti grezzi.

export type PriceSummaryKind = "none" | "single" | "multi";

export type PriceSummary = {
    kind: PriceSummaryKind;
    min: number | null;
    max: number | null;
    /** Numero di valori con prezzo valido — non il totale dei valori del gruppo. */
    count: number;
};

/**
 * Calcola i fatti sul prezzo a partire da una lista di prezzi grezzi.
 * Accetta sia valori raw di un gruppo PRIMARY_PRICE (dopo `.map(v =>
 * v.absolute_price)`) sia prezzi di varianti già risolti a scalare —
 * stessa regola in entrambi i casi: solo i numeri contano, null/undefined
 * sono "nessun prezzo per quel valore/quella variante".
 */
export function resolvePriceSummary(
    prices: Array<number | null | undefined>
): PriceSummary {
    const valid = prices.filter((p): p is number => typeof p === "number");

    if (valid.length === 0) {
        return { kind: "none", min: null, max: null, count: 0 };
    }

    return {
        kind: valid.length === 1 ? "single" : "multi",
        min: Math.min(...valid),
        max: Math.max(...valid),
        count: valid.length
    };
}
