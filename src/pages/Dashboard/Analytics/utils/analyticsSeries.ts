import type { TrendPoint } from "@/components/ui/TrendChart/TrendChart";
import type { DateRange, PeriodKey } from "./periodComparison";

/**
 * Le serie di Analitiche per `TrendChart`: le RPC restituiscono solo i giorni
 * (e le ore) con dati, il grafico vuole la finestra intera, a zero dove non
 * c'è niente. Puro: nessun DOM, nessun fetch.
 */

/** Giorno UTC (YYYY-MM-DD) di un istante — coerente con il DATE_TRUNC delle RPC. */
function utcDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

function daysBetween(fromKey: string, toKey: string): string[] {
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const [ty, tm, td] = toKey.split("-").map(Number);
    const cursor = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));
    const out: string[] = [];
    while (cursor <= end) {
        out.push(utcDayKey(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

/**
 * Serie giornaliera contigua: sulle finestre fisse fino agli estremi del
 * periodo; su «Tutto» dal primo all'ultimo giorno con dati (niente migliaia
 * di giorni vuoti). Vuota se non c'è nessun dato.
 */
export function fillDaily(points: TrendPoint[], range: DateRange, period: PeriodKey): TrendPoint[] {
    if (points.length === 0) return [];
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map(sorted.map(p => [p.date.slice(0, 10), p.value]));
    const keys =
        period === "all"
            ? daysBetween(sorted[0].date.slice(0, 10), sorted[sorted.length - 1].date.slice(0, 10))
            : daysBetween(utcDayKey(range.from), utcDayKey(range.to));
    return keys.map(date => ({ date, value: byDate.get(date) ?? 0 }));
}

/** Le 24 ore, a zero dove non c'è niente; `date` è l'ora («13»). Vuota senza dati. */
export function fillHourly(points: { hour: number; value: number }[]): TrendPoint[] {
    if (points.length === 0) return [];
    const byHour = new Map(points.map(p => [p.hour, p.value]));
    return Array.from({ length: 24 }, (_, hour) => ({ date: String(hour), value: byHour.get(hour) ?? 0 }));
}

/** Etichetta dell'ora sull'asse e nel tooltip: «13:00». */
export function formatHour(date: string): string {
    return `${date}:00`;
}
