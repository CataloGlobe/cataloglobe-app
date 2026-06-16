import {
    ResponsiveContainer,
    ComposedChart,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Bar,
    Line
} from "recharts";
import type { OrdersTrendPoint, DateRange } from "@/services/supabase/analytics";
import type { PeriodKey } from "../utils/periodComparison";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { formatEur } from "../utils/ordersFormat";
import styles from "../Analytics.module.scss";

type Props = {
    data: OrdersTrendPoint[];
    /** Range del periodo selezionato — usato per il zero-fill a finestra fissa. */
    dateRange: DateRange;
    period: PeriodKey;
    isLoading: boolean;
};

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

/** Giorno UTC (YYYY-MM-DD) di un istante — coerente con il DATE_TRUNC della RPC. */
function utcDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Serie giornaliera contigua da fromKey a toKey (inclusi), zero-fill dei buchi. */
function fillBetween(
    byDate: Map<string, OrdersTrendPoint>,
    fromKey: string,
    toKey: string
): OrdersTrendPoint[] {
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const [ty, tm, td] = toKey.split("-").map(Number);
    const cursor = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));

    const out: OrdersTrendPoint[] = [];
    while (cursor <= end) {
        const key = utcDayKey(cursor);
        out.push(byDate.get(key) ?? { date: key, orders_count: 0, revenue: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

/**
 * Zero-fill dei giorni senza ordini (la RPC restituisce solo i giorni con dati).
 * - Finestra fissa (Oggi/7/30/90gg): riempie fino agli ESTREMI del periodo
 *   selezionato, allineandosi al filtro e a "Visite nel tempo".
 * - "Tutto": bound al range effettivo dei dati (min→max) per non esplodere a
 *   migliaia di giorni vuoti.
 * In entrambi i casi: barre e linea a 0 nei giorni vuoti, niente trascinamento.
 */
function buildSeries(data: OrdersTrendPoint[], dateRange: DateRange, period: PeriodKey): OrdersTrendPoint[] {
    if (data.length === 0) return [];

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map(sorted.map(d => [d.date, d]));

    if (period === "all") {
        return fillBetween(byDate, sorted[0].date, sorted[sorted.length - 1].date);
    }
    return fillBetween(byDate, utcDayKey(dateRange.from), utcDayKey(dateRange.to));
}

export default function OrdersTrendChart({ data, dateRange, period, isLoading }: Props) {
    const chartData = buildSeries(data, dateRange, period).map(d => ({ ...d, label: formatDate(d.date) }));

    return (
        <article className={`${styles.chartCard} ${styles.chartCardWide}`} aria-label="Ordini e ricavi nel tempo">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Ordini e ricavi nel tempo
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <Skeleton height="300px" radius="12px" />
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun ordine nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                            />
                            <YAxis
                                yAxisId="orders"
                                allowDecimals={false}
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                            />
                            <YAxis
                                yAxisId="revenue"
                                orientation="right"
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                                tickFormatter={(v: number) => formatEur(v)}
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 8,
                                    border: "1px solid var(--border, #e2e8f0)",
                                    fontSize: 13
                                }}
                                formatter={(value, name) =>
                                    name === "revenue"
                                        ? [formatEur(Number(value)), "Ricavi"]
                                        : [String(value), "Ordini"]
                                }
                            />
                            <Bar
                                yAxisId="orders"
                                dataKey="orders_count"
                                name="orders"
                                fill="var(--brand-primary, #6366f1)"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={36}
                            />
                            <Line
                                yAxisId="revenue"
                                type="monotone"
                                dataKey="revenue"
                                name="revenue"
                                stroke="#16a34a"
                                strokeWidth={2}
                                dot={false}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </article>
    );
}
