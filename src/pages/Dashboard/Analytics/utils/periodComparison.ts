import { romeDayOf, romeInstantAt } from "@/utils/romeInstant";
import type { DateRange } from "@/services/supabase/analytics";

// Una sola dichiarazione della finestra: quella del service (#641).
export type { DateRange };

export type PeriodKey = "today" | "7d" | "30d" | "90d" | "all";

/** Il periodo con cui le analitiche si aprono (mockup, A3): 30 giorni. */
export const DEFAULT_PERIOD: PeriodKey = "30d";

/** `?period=` → periodo; un valore sconosciuto torna al default. */
export function parsePeriod(value: string | null): PeriodKey {
    return value === "today" || value === "7d" || value === "30d" || value === "90d" || value === "all"
        ? value
        : DEFAULT_PERIOD;
}

/**
 * La finestra del periodo, fino a `now`. «Oggi» parte dalla mezzanotte di
 * Roma, non da quella del browser (A3); «Tutto» dal 01/01/2020.
 */
export function periodToDateRange(period: PeriodKey, now: Date = new Date()): DateRange {
    const to = new Date(now.getTime());
    switch (period) {
        case "today":
            return { from: new Date(romeInstantAt(romeDayOf(now), 0).epoch), to };
        case "7d":
        case "30d":
        case "90d": {
            const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
            const from = new Date(now.getTime());
            from.setDate(from.getDate() - days);
            return { from, to };
        }
        case "all":
            return { from: new Date(2020, 0, 1), to };
    }
}

export function getPreviousRange(current: DateRange): DateRange {
    const durationMs = current.to.getTime() - current.from.getTime();
    return {
        from: new Date(current.from.getTime() - durationMs),
        to: new Date(current.to.getTime() - durationMs)
    };
}

/**
 * Sotto questa soglia di visite nel periodo niente percentuali né confronti
 * fra periodi: su questi numeri direbbero il caso, non il locale (§36.1/3).
 */
export const SAMPLE_THRESHOLD = 100;

/** Base minima del confronto: sotto, «+300%» su tre eventi è rumore (§36.1/3). */
export const MIN_DELTA_BASE = 10;

export function isBelowSample(visits: number): boolean {
    return visits < SAMPLE_THRESHOLD;
}

export function calculateDelta(current: number, previous: number, minBase: number = MIN_DELTA_BASE): number | null {
    if (previous === 0 || previous < minBase) return null;
    return ((current - previous) / previous) * 100;
}

export function getPreviousPeriodLabel(period: PeriodKey): string {
    switch (period) {
        case "today":
            return "ieri";
        case "7d":
            return "7 giorni prima";
        case "30d":
            return "30 giorni prima";
        case "90d":
            return "90 giorni prima";
        case "all":
            return "periodo precedente";
    }
}
