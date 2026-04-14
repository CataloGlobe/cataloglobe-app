import { Eye, Users, Activity, Search } from "lucide-react";
import type { OverviewStats } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    stats: OverviewStats | null;
    searchRate: number | null;
    isLoading: boolean;
};

export default function OverviewCards({ stats, searchRate, isLoading }: Props) {
    const cards = [
        {
            label: "Visite totali",
            icon: Eye,
            value: stats ? stats.total_views.toLocaleString("it-IT") : "—"
        },
        {
            label: "Sessioni uniche",
            icon: Users,
            value: stats ? stats.unique_sessions.toLocaleString("it-IT") : "—"
        },
        {
            label: "Media eventi/sessione",
            icon: Activity,
            value: stats ? stats.avg_events_per_session.toFixed(1) : "—"
        },
        {
            label: "Tasso di ricerca",
            icon: Search,
            value: searchRate !== null ? `${searchRate.toFixed(1)}%` : "—"
        }
    ];

    return (
        <div className={styles.kpiGrid}>
            {cards.map(({ label, icon: Icon, value }) => (
                <div key={label} className={styles.kpiCard}>
                    <div className={styles.kpiHeader}>
                        <Text variant="caption" colorVariant="muted">
                            {label}
                        </Text>
                        <Icon size={16} strokeWidth={1.75} className={styles.kpiIcon} />
                    </div>
                    {isLoading ? (
                        <Skeleton height="32px" width="60%" radius="8px" />
                    ) : (
                        <Text variant="title-md" weight={600}>
                            {value}
                        </Text>
                    )}
                </div>
            ))}
        </div>
    );
}
