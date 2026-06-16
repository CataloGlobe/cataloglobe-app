import { CalendarCheck, Users, CircleCheck, Globe } from "lucide-react";
import type { ReservationsOverview } from "@/services/supabase/analytics";
import { calculateDelta } from "../utils/periodComparison";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: ReservationsOverview | null;
    previous?: ReservationsOverview | null;
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

export default function ReservationsOverviewCards({
    data,
    previous,
    previousPeriodLabel,
    isLoading
}: Props) {
    const cards = [
        {
            label: "Prenotazioni",
            icon: CalendarCheck,
            value: data ? data.reservations_count.toLocaleString("it-IT") : "—",
            current: data?.reservations_count ?? 0,
            previous: previous?.reservations_count,
            sub: undefined as string | undefined
        },
        {
            label: "Coperti",
            icon: Users,
            value: data ? data.covers.toLocaleString("it-IT") : "—",
            current: data?.covers ?? 0,
            previous: previous?.covers,
            sub: undefined as string | undefined
        },
        {
            label: "Confermate",
            icon: CircleCheck,
            value: data ? data.confirmed_count.toLocaleString("it-IT") : "—",
            current: data?.confirmed_count ?? 0,
            previous: undefined as number | undefined,
            sub: data
                ? `${data.confirm_rate.toLocaleString("it-IT", {
                      minimumFractionDigits: 1,
                      maximumFractionDigits: 1
                  })}% · ${data.declined_count} rifiutate · ${data.cancelled_count} annullate`
                : undefined
        },
        {
            label: "Online / manuale",
            icon: Globe,
            value: data ? `${data.online_count} / ${data.manual_count}` : "—",
            current: data?.online_count ?? 0,
            previous: undefined as number | undefined,
            sub: "ricevute online / inserite a mano"
        }
    ];

    return (
        <div className={styles.kpiGrid}>
            {cards.map(({ label, icon: Icon, value, current, previous: prev, sub }) => (
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
                            {sub && (
                                <Text variant="caption" colorVariant="muted">
                                    {sub}
                                </Text>
                            )}
                            <DeltaRow
                                current={current}
                                previous={prev}
                                label={previousPeriodLabel}
                            />
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
