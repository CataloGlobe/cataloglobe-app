import { useState } from "react";
import type { OrdersHourlyPoint } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { formatEur } from "../utils/ordersFormat";
import styles from "../Analytics.module.scss";

type Props = {
    data: OrdersHourlyPoint[];
    isLoading: boolean;
};

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
    return h.toString().padStart(2, "0") + ":00";
}

export default function OrdersHourlyChart({ data, isLoading }: Props) {
    const [tooltip, setTooltip] = useState<{ hour: number; count: number; revenue: number; x: number; y: number } | null>(null);

    const byHour = new Map(data.map(d => [d.hour, d]));
    const maxCount = data.length > 0 ? Math.max(...data.map(d => d.orders_count)) : 1;

    return (
        <article className={styles.chartCard} aria-label="Ordini per fascia oraria">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Ordini per fascia oraria
                </Text>
            </header>

            <div className={styles.chartCardBody} style={{ minHeight: "unset" }}>
                {isLoading ? (
                    <Skeleton height="200px" radius="8px" />
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun ordine nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.hourlyWrapper}>
                        <div className={styles.hourlyBars}>
                            {ALL_HOURS.map(hour => {
                                const point = byHour.get(hour);
                                const count = point?.orders_count ?? 0;
                                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                const isDark = heightPct >= 60;

                                return (
                                    <div
                                        key={hour}
                                        className={styles.hourlyBarCol}
                                        onMouseEnter={e => {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setTooltip({
                                                hour,
                                                count,
                                                revenue: point?.revenue ?? 0,
                                                x: rect.left + rect.width / 2,
                                                y: rect.top
                                            });
                                        }}
                                        onMouseLeave={() => setTooltip(null)}
                                    >
                                        <div className={styles.hourlyBarTrack}>
                                            <div
                                                className={styles.hourlyBarFill}
                                                style={{
                                                    height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%`,
                                                    background: isDark ? "#1C1917" : "#e2e8f0"
                                                }}
                                            />
                                        </div>
                                        {hour % 3 === 0 && (
                                            <span className={styles.hourlyLabel}>
                                                {hour.toString().padStart(2, "0")}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {tooltip && (
                            <div
                                className={styles.hourlyTooltip}
                                style={{
                                    position: "fixed",
                                    top: tooltip.y - 54,
                                    left: tooltip.x,
                                    transform: "translateX(-50%)",
                                    pointerEvents: "none"
                                }}
                            >
                                <Text variant="caption" weight={600}>
                                    {formatHour(tooltip.hour)}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    {tooltip.count} ordini · {formatEur(tooltip.revenue)}
                                </Text>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}
