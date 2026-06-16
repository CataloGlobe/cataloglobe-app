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
import type { ReservationsTrendPoint, DateRange } from "@/services/supabase/analytics";
import type { PeriodKey } from "../utils/periodComparison";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: ReservationsTrendPoint[];
    dateRange: DateRange;
    period: PeriodKey;
    isLoading: boolean;
};

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

function utcDayKey(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Serie giornaliera contigua da fromKey a toKey (inclusi), zero-fill dei buchi. */
function fillBetween(
    byDate: Map<string, ReservationsTrendPoint>,
    fromKey: string,
    toKey: string
): ReservationsTrendPoint[] {
    const [fy, fm, fd] = fromKey.split("-").map(Number);
    const [ty, tm, td] = toKey.split("-").map(Number);
    const cursor = new Date(Date.UTC(fy, fm - 1, fd));
    const end = new Date(Date.UTC(ty, tm - 1, td));

    const out: ReservationsTrendPoint[] = [];
    while (cursor <= end) {
        const key = utcDayKey(cursor);
        out.push(byDate.get(key) ?? { date: key, reservations_count: 0, covers: 0 });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
}

function buildSeries(data: ReservationsTrendPoint[], dateRange: DateRange, period: PeriodKey): ReservationsTrendPoint[] {
    if (data.length === 0) return [];

    const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
    const byDate = new Map(sorted.map(d => [d.date, d]));

    if (period === "all") {
        return fillBetween(byDate, sorted[0].date, sorted[sorted.length - 1].date);
    }
    return fillBetween(byDate, utcDayKey(dateRange.from), utcDayKey(dateRange.to));
}

export default function ReservationsTrendChart({ data, dateRange, period, isLoading }: Props) {
    const chartData = buildSeries(data, dateRange, period).map(d => ({ ...d, label: formatDate(d.date) }));

    return (
        <article className={`${styles.chartCard} ${styles.chartCardWide}`} aria-label="Prenotazioni nel tempo">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Prenotazioni nel tempo
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <Skeleton height="300px" radius="12px" />
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessuna prenotazione nel periodo selezionato
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
                                yAxisId="count"
                                allowDecimals={false}
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                            />
                            <YAxis
                                yAxisId="covers"
                                orientation="right"
                                allowDecimals={false}
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                            />
                            <Tooltip
                                contentStyle={{
                                    borderRadius: 8,
                                    border: "1px solid var(--border, #e2e8f0)",
                                    fontSize: 13
                                }}
                                formatter={(value, name) =>
                                    name === "covers"
                                        ? [String(value), "Coperti"]
                                        : [String(value), "Prenotazioni"]
                                }
                            />
                            <Bar
                                yAxisId="count"
                                dataKey="reservations_count"
                                name="count"
                                fill="var(--brand-primary, #6366f1)"
                                radius={[4, 4, 0, 0]}
                                maxBarSize={36}
                            />
                            <Line
                                yAxisId="covers"
                                type="monotone"
                                dataKey="covers"
                                name="covers"
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
