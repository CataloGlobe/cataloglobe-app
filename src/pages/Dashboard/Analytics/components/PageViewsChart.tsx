import {
    ResponsiveContainer,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Area,
    AreaChart
} from "recharts";
import type { TrendDataPoint } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: TrendDataPoint[];
    isLoading: boolean;
};

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export default function PageViewsChart({ data, isLoading }: Props) {
    const chartData = data.map(d => ({ ...d, label: formatDate(d.date) }));

    return (
        <article className={`${styles.chartCard} ${styles.chartCardWide}`} aria-label="Visite nel tempo">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Visite nel tempo
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <Skeleton height="300px" radius="12px" />
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun dato per il periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="viewsGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--brand-primary, #6366f1)" stopOpacity={0.2} />
                                    <stop offset="100%" stopColor="var(--brand-primary, #6366f1)" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e2e8f0)" />
                            <XAxis
                                dataKey="label"
                                tick={{ fontSize: 12 }}
                                stroke="var(--text-muted, #94a3b8)"
                            />
                            <YAxis
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
                                formatter={(value) => [String(value), "Visite"]}
                            />
                            <Area
                                type="monotone"
                                dataKey="count"
                                stroke="var(--brand-primary, #6366f1)"
                                strokeWidth={2}
                                fill="url(#viewsGradient)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                )}
            </div>
        </article>
    );
}
