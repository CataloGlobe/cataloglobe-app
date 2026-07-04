// src/components/ui/DataTable/autoPageSize.ts
// Logica pura per il calcolo dinamico delle righe per pagina di DataTable.
// Nessun import React/DOM: testabile in isolamento (vitest, alias solo "@").
// Spec: docs/superpowers/specs/2026-07-03-datatable-auto-pagesize-design.md

export const AUTO_MIN_ROWS = 5;
export const AUTO_MAX_ROWS = 100;
export const FALLBACK_PAGE_SIZE = 25;
// Sotto questa differenza probe/contenuto il caso è ambiguo (probe che cresce
// col contenuto = contenitore non vincolato) → fallback conservativo.
export const AMBIGUITY_TOLERANCE_PX = 4;

export interface ProbeMeasure {
    /** offsetHeight del wrapper .autoSizeProbe */
    probeHeightPx: number;
    /** scrollHeight del root .table (altezza naturale del contenuto) */
    contentHeightPx: number;
    /** max-height risolta in px del root .table */
    maxHeightPx: number;
    /**
     * true se `maxHeight` è stato passato ESPLICITAMENTE dal chiamante (tetto
     * voluto, es. drawer che non deve sfondare). false se è il default interno
     * del componente (rete di sicurezza solo per il ramo ambiguo/fallback).
     */
    maxHeightIsExplicit: boolean;
    /**
     * true se il probe è realmente stretchato da un genitore flex/grid a colonna
     * VINCOLATO (altezza imposta dal parent, indipendente dal contenuto). Segnale
     * STRUTTURALE, non basato sull'altezza: risolve la collisione del ramo
     * ambiguo quando la tabella riempie il probe (probe≈content ma vincolato).
     * false = genitore block non vincolato (probe cresce col contenuto).
     */
    isProbeStretched: boolean;
}

/**
 * Spazio verticale utilizzabile. Se il probe ha un'altezza chiaramente diversa
 * dal contenuto, il genitore lo sta vincolando → misura reale affidabile.
 * Il tetto `maxHeight` di DEFAULT è solo una rete di sicurezza per il ramo
 * ambiguo: NON va applicato sopra una misura reale valida, altrimenti
 * sottostima lo spazio disponibile e vanifica la catena flex. Un `maxHeight`
 * ESPLICITO del chiamante resta invece un tetto voluto anche sul probe reale.
 * Se probe ≈ contenuto il caso è ambiguo (contenitore block non vincolato: il
 * probe cresce col contenuto) → MAI usare la misura, fallback su maxHeight
 * per evitare loop di crescita.
 */
export function resolveAvailable(m: ProbeMeasure): number {
    if (!Number.isFinite(m.probeHeightPx) || !Number.isFinite(m.contentHeightPx)) {
        return m.maxHeightPx;
    }
    // `diff` piccolo capita in DUE casi opposti: (a) probe VINCOLATO che la tabella
    // ha riempito → vogliamo tenere la misura reale; (b) contenitore NON vincolato
    // dove probe≈content per crescita → fallback. Il segnale strutturale
    // `isProbeStretched` (parent flex a colonna vincolato) li distingue senza
    // dipendere dall'altezza del contenuto → niente più oscillazione al fixpoint.
    const diffSmall =
        Math.abs(m.probeHeightPx - m.contentHeightPx) <= AMBIGUITY_TOLERANCE_PX;
    const ambiguous = diffSmall && !m.isProbeStretched;
    if (ambiguous) return m.maxHeightPx;
    if (m.maxHeightIsExplicit) return Math.min(m.probeHeightPx, m.maxHeightPx);
    return m.probeHeightPx;
}

/** Righe che entrano nello spazio disponibile, clampate [5, 100]. */
export function computeFit(
    availablePx: number,
    chromePx: number,
    avgRowPx: number
): number | null {
    if (
        !Number.isFinite(availablePx) ||
        !Number.isFinite(chromePx) ||
        !Number.isFinite(avgRowPx) ||
        avgRowPx <= 0 ||
        availablePx <= 0
    ) {
        return null;
    }
    const rows = Math.floor((availablePx - chromePx) / avgRowPx);
    return Math.min(AUTO_MAX_ROWS, Math.max(AUTO_MIN_ROWS, rows));
}

export interface HysteresisState {
    applied: number;
    pending: number | null;
}

/**
 * Anti-oscillazione: il campione di righe può dare fit adiacenti alternati
 * (33↔34). Delta ≥2 → applica subito; delta ±1 → applica solo alla seconda
 * conferma consecutiva dello stesso valore.
 */
export function applyHysteresis(
    state: HysteresisState,
    candidate: number
): HysteresisState {
    if (candidate === state.applied) return { applied: state.applied, pending: null };
    if (Math.abs(candidate - state.applied) >= 2) {
        return { applied: candidate, pending: null };
    }
    if (state.pending === candidate) return { applied: candidate, pending: null };
    return { applied: state.applied, pending: candidate };
}

/** Media delle altezze positive del campione righe. */
export function averageRowHeight(heights: number[]): number | null {
    const valid = heights.filter(h => h > 0);
    if (valid.length === 0) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export type PageSizeSelection = number | "all" | "auto";

/** pageSize numerico effettivo dalla selezione corrente. */
export function resolveNumericPageSize(
    selection: PageSizeSelection,
    autoFit: number | null,
    dataLength: number
): number {
    if (selection === "all") return dataLength;
    if (selection === "auto") return autoFit ?? FALLBACK_PAGE_SIZE;
    return selection;
}

/** Garantisce l'opzione "auto" in testa alla lista del dropdown. */
export function withAutoOption(
    options: ReadonlyArray<PageSizeSelection>
): PageSizeSelection[] {
    return ["auto", ...options.filter(o => o !== "auto")];
}
