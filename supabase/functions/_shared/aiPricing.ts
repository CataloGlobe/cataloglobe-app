// =============================================================================
// aiPricing — tariffario versionato per il metering AI (Edge-only)
// =============================================================================
//
// Source of truth del costo unitario per modello. Usato SOLO da aiUsageLog.ts
// per calcolare ai_usage_events.cost_nanos_usd (nano-USD, 1e-9 USD) dalle
// unità grezze.
//
// Il costo persistito è una comodità: le unità grezze restano immutabili in
// tabella e il costo è sempre ricomputabile da (model + unità × tariffario).
// Al cambio modello (es. migrazione a Gemini 3.x, ritiro gemini-2.5-flash il
// 16 ott 2026) o al cambio prezzi: aggiungere/aggiornare la entry QUI e
// incrementare PRICE_MAP_VERSION. Mai riscrivere lo storico: le entry dei
// modelli ritirati restano per ricomputare gli eventi già registrati.
//
// Prezzi correnti (USD, valuta di pricing dei provider):
//   - gemini-2.5-flash:      $0.30 / 1M token input, $2.50 / 1M token output (ritiro 16/10/2026)
//   - gemini-3.5-flash-lite: $0.30 / 1M token input, $2.50 / 1M token output (modello in uso)
//   - deepl:                 $25 / 1M caratteri
// =============================================================================

export const PRICE_MAP_VERSION = "2026-07-28.v2";

export interface ModelPrice {
    /** nano-USD per unità di input (token). */
    perInputUnitNanoUsd?: number;
    /** nano-USD per unità di output (token). */
    perOutputUnitNanoUsd?: number;
    /** nano-USD per unità totale (caratteri) — per provider a tariffa unica. */
    perTotalUnitNanoUsd?: number;
}

export const MODEL_PRICES: Record<string, ModelPrice> = {
    // Ritirato 16/10/2026 — entry mantenuta per ricomputare lo storico.
    // $0.30/1M input = 300 nano-USD/token; $2.50/1M output = 2500 nano-USD/token
    "gemini-2.5-flash": { perInputUnitNanoUsd: 300, perOutputUnitNanoUsd: 2500 },
    // $0.30/1M input = 300 nano-USD/token; $2.50/1M output = 2500 nano-USD/token
    "gemini-3.5-flash-lite": { perInputUnitNanoUsd: 300, perOutputUnitNanoUsd: 2500 },
    // $25/1M caratteri = 25000 nano-USD/carattere
    "deepl": { perTotalUnitNanoUsd: 25000 }
};

/**
 * Costo in nano-USD (millesimi di micro-dollaro) per un evento di consumo.
 * Ritorna null se il modello non è nel tariffario (evento comunque loggato:
 * le unità grezze permettono il ricalcolo a posteriori).
 */
export function computeCostNanoUsd(
    model: string,
    unitsInput: number | null,
    unitsOutput: number | null,
    unitsTotal: number | null
): number | null {
    const price = MODEL_PRICES[model];
    if (!price) return null;

    let cost = 0;
    if (price.perInputUnitNanoUsd !== undefined && unitsInput !== null) {
        cost += unitsInput * price.perInputUnitNanoUsd;
    }
    if (price.perOutputUnitNanoUsd !== undefined && unitsOutput !== null) {
        cost += unitsOutput * price.perOutputUnitNanoUsd;
    }
    if (price.perTotalUnitNanoUsd !== undefined && unitsTotal !== null) {
        cost += unitsTotal * price.perTotalUnitNanoUsd;
    }
    return Math.round(cost);
}
