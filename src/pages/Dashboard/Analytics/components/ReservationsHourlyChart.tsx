import { useState } from "react";
import type { ReservationsHourlyPoint } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: ReservationsHourlyPoint[];
    isLoading: boolean;
};

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

function formatHour(h: number): string {
    return h.toString().padStart(2, "0") + ":00";
}

export default function ReservationsHourlyChart({ data, isLoading }: Props) {
    const [tooltip, setTooltip] = useState<{ hour: number; count: number; x: number; y: number } | null>(null);

    const byHour = new Map(data.map(d => [d.hour, d.reservations_count]));
    const maxCount = data.length > 0 ? Math.max(...data.map(d => d.reservations_count)) : 1;

    return (
        <article className={styles.chartCard} aria-label="Prenotazioni per fascia oraria">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Per fascia oraria
                </Text>
            </header>

            <div className={styles.chartCardBody} style={{ minHeight: "unset" }}>
                {isLoading ? (
                    <Skeleton height="200px" radius="8px" />
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessuna prenotazione nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.hourlyWrapper}>
                        <div className={styles.hourlyBars}>
                            {ALL_HOURS.map(hour => {
                                const count = byHour.get(hour) ?? 0;
                                const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                                const isDark = heightPct >= 60;

                                return (
                                    <div
                                        key={hour}
                                        className={styles.hourlyBarCol}
                                        onMouseEnter={e => {
                                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                            setTooltip({ hour, count, x: rect.left + rect.width / 2, y: rect.top });
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
                                    top: tooltip.y - 44,
                                    left: tooltip.x,
                                    transform: "translateX(-50%)",
                                    pointerEvents: "none"
                                }}
                            >
                                <Text variant="caption" weight={600}>
                                    {formatHour(tooltip.hour)}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    {tooltip.count}{" "}
                                    {tooltip.count === 1 ? "prenotazione" : "prenotazioni"}
                                </Text>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}
