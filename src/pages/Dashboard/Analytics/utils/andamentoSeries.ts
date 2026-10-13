import type { TrendPoint } from "@/components/ui/TrendChart/TrendChart";
import { formatPrice } from "@/utils/formatCurrency";
import type { TrendDataPoint } from "@/services/supabase/analytics";
import type { AndamentoData, SedeNumbers } from "./andamentoData";
import { visitsDelta, type RowKey, type SedeCompared } from "./andamentoRows";
import { fillDaily } from "./analyticsSeries";
import { calculateDelta, getPreviousRange, type DateRange, type PeriodKey } from "./periodComparison";

/**
 * Le serie giorno per giorno di Andamento (D154): una per la riga, una per
 * sede col confronto, il periodo prima tratteggiato. Puro.
 */

/** Più serie sugli stessi giorni: su «Sempre» dal primo all'ultimo giorno di tutte. */
export function alignDaily(series: readonly TrendPoint[][], range: DateRange, period: PeriodKey): { dates: string[]; values: number[][] } {
    const dates = fillDaily(series.flat(), range, period).map(p => p.date);
    const values = series.map(s => {
        const byDate = new Map<string, number>();
        for (const p of s) byDate.set(p.date.slice(0, 10), (byDate.get(p.date.slice(0, 10)) ?? 0) + p.value);
        return dates.map(d => byDate.get(d) ?? 0);
    });
    return { dates, values };
}

const views = (points: readonly TrendDataPoint[]): TrendPoint[] => points.map(p => ({ date: p.date, value: p.count }));

/** Le metriche con una serie giornaliera: la riga e la striscia della vista A. */
export type SeriesKey = "visite" | "ordini" | "incasso" | "coperti";

export const SERIES_OF_ROW: Partial<Record<RowKey, SeriesKey>> = {
    pagina: "visite",
    tavolo: "ordini",
    prenotazioni: "coperti"
};

export const SERIES_TITLE: Record<SeriesKey, string> = {
    visite: "Visite alla pagina",
    ordini: "Ordini al tavolo",
    incasso: "Incasso al tavolo",
    coperti: "Coperti prenotati"
};

function pointsOf(key: SeriesKey, n: SedeNumbers): TrendPoint[] {
    switch (key) {
        case "visite":
            return views(n.viewsTrend);
        case "ordini":
            return n.ordersTrend.map(p => ({ date: p.date, value: p.orders_count }));
        case "incasso":
            return n.ordersTrend.map(p => ({ date: p.date, value: p.revenue }));
        case "coperti":
            return n.reservationsTrend.map(p => ({ date: p.date, value: p.covers }));
    }
}

export interface DailyChart {
    dates: string[];
    /** Una serie per sede (la prima è quella che si guarda), o una sola. */
    values: number[][];
    /** Il periodo prima, solo per le visite senza confronto. */
    previous: number[] | null;
}

export function dailyChart(
    key: SeriesKey,
    own: SedeNumbers,
    data: AndamentoData,
    compare: readonly SedeCompared[] | null,
    range: DateRange,
    period: PeriodKey
): DailyChart {
    const list = compare ? compare.map(s => s.numbers) : [own];
    const { dates, values } = alignDaily(list.map(n => pointsOf(key, n)), range, period);
    let previous: number[] | null = null;
    if (!compare && key === "visite" && period !== "all" && data.previousViewsTrend.length > 0) {
        previous = fillDaily(views(data.previousViewsTrend), getPreviousRange(range), period).map(p => p.value);
    }
    return { dates, values, previous };
}

/** Il totale di una metrica per una sede: il numero e il confronto col periodo prima. */
export function seriesTotal(key: SeriesKey, n: SedeNumbers): { label: string; delta: number | null } {
    const int = (v: number) => Math.round(v).toLocaleString("it-IT");
    switch (key) {
        case "visite":
            return { label: int(n.visits), delta: visitsDelta(n.visits, n.previousVisits) };
        case "ordini":
            return { label: int(n.orders), delta: n.previousOrders === null ? null : calculateDelta(n.orders, n.previousOrders) };
        case "incasso":
            return { label: formatPrice(n.revenue), delta: n.previousRevenue === null ? null : calculateDelta(n.revenue, n.previousRevenue) };
        case "coperti":
            return { label: int(n.covers), delta: n.previousCovers === null ? null : calculateDelta(n.covers, n.previousCovers) };
    }
}
