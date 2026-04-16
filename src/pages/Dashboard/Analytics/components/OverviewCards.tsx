import { Eye, Users, Activity, Search } from "lucide-react";
import type { OverviewStats } from "@/services/supabase/analytics";
import { calculateDelta } from "../utils/periodComparison";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    stats: OverviewStats | null;
    searchRate: number | null;
    previousStats?: OverviewStats | null;
    previousSearchRate?: number | null;
    previousPeriodLabel?: string;
    isLoading: boolean;
};

function formatDelta(delta: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "percent",
        maximumFractionDigits: 1,
        signDisplay: "always",
        minimumFractionDigits: 1
    }).format(delta / 100);
}

interface DeltaRowProps {
    current: number;
    previous: number | null | undefined;
    label: string | undefined;
}

function DeltaRow({ current, previous, label }: DeltaRowProps) {
    if (previous == null || !label) return null;

    const delta = calculateDelta(current, previous);
    if (delta === null) return null;

    const isPositive = delta > 0;
    const isNegative = delta < 0;
    const colorClass = isPositive
        ? styles.kpiDeltaPositive
        : isNegative
          ? styles.kpiDeltaNegative
          : styles.kpiDeltaNeutral;

    const arrow = isPositive ? "↑" : isNegative ? "↓" : "";

    return (
        <div className={`${styles.kpiDelta} ${colorClass}`}>
            {arrow && <span>{arrow}</span>}
            <span>{formatDelta(delta)}</span>
            <span className={styles.kpiDeltaLabel}>vs {label}</span>
        </div>
    );
}

export default function OverviewCards({
    stats,
    searchRate,
    previousStats,
    previousSearchRate,
    previousPeriodLabel,
    isLoading
}: Props) {
    const cards = [
        {
            label: "Visite totali",
            icon: Eye,
            value: stats ? stats.total_views.toLocaleString("it-IT") : "—",
            current: stats?.total_views ?? 0,
            previous: previousStats?.total_views
        },
        {
            label: "Sessioni uniche",
            icon: Users,
            value: stats ? stats.unique_sessions.toLocaleString("it-IT") : "—",
            current: stats?.unique_sessions ?? 0,
            previous: previousStats?.unique_sessions
        },
        {
            label: "Media eventi/sessione",
            icon: Activity,
            value: stats ? stats.avg_events_per_session.toFixed(1) : "—",
            current: stats?.avg_events_per_session ?? 0,
            previous: previousStats?.avg_events_per_session
        },
        {
            label: "Tasso di ricerca",
            icon: Search,
            value: searchRate !== null ? `${searchRate.toFixed(1)}%` : "—",
            current: searchRate ?? 0,
            previous: previousSearchRate
        }
    ];

    return (
        <div className={styles.kpiGrid}>
            {cards.map(({ label, icon: Icon, value, current, previous }) => (
                <div key={label} className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <Text variant="caption" colorVariant="muted">
                            {label}
                        </Text>
                        <Icon size={16} strokeWidth={1.75} className={styles.kpiIcon} />
                    </div>
                    {isLoading ? (
                        <>
                            <Skeleton height="32px" width="60%" radius="8px" />
                            <Skeleton height="14px" width="80%" radius="4px" />
                        </>
                    ) : (
                        <>
                            <Text variant="title-md" weight={600}>
                                {value}
                            </Text>
                            <DeltaRow
                                current={current}
                                previous={previous}
                                label={previousPeriodLabel}
                            />
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
