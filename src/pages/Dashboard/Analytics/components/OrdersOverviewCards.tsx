import { ShoppingBag, Euro, Receipt, XCircle } from "lucide-react";
import type { OrdersOverview } from "@/services/supabase/analytics";
import { calculateDelta } from "../utils/periodComparison";
import { formatEur } from "../utils/ordersFormat";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: OrdersOverview | null;
    previous?: OrdersOverview | null;
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
    /** When true, a positive delta is "bad" (e.g. cancellation rate). */
    invert?: boolean;
}

function DeltaRow({ current, previous, label, invert = false }: DeltaRowProps) {
    if (previous == null || !label) return null;

    const delta = calculateDelta(current, previous);
    if (delta === null) return null;

    const isUp = delta > 0;
    const isDown = delta < 0;
    const isGood = invert ? isDown : isUp;
    const isBad = invert ? isUp : isDown;

    const colorClass = isGood
        ? styles.kpiDeltaPositive
        : isBad
          ? styles.kpiDeltaNegative
          : styles.kpiDeltaNeutral;

    const arrow = isUp ? "↑" : isDown ? "↓" : "";

    return (
        <div className={`${styles.kpiDelta} ${colorClass}`}>
            {arrow && <span>{arrow}</span>}
            <span>{formatDelta(delta)}</span>
            <span className={styles.kpiDeltaLabel}>vs {label}</span>
        </div>
    );
}

export default function OrdersOverviewCards({
    data,
    previous,
    previousPeriodLabel,
    isLoading
}: Props) {
    const cards = [
        {
            label: "Ordini",
            icon: ShoppingBag,
            value: data ? data.orders_count.toLocaleString("it-IT") : "—",
            current: data?.orders_count ?? 0,
            previous: previous?.orders_count,
            invert: false,
            sub: undefined as string | undefined
        },
        {
            label: "Ricavi",
            icon: Euro,
            value: data ? formatEur(data.revenue) : "—",
            current: data?.revenue ?? 0,
            previous: previous?.revenue,
            invert: false,
            sub: undefined as string | undefined
        },
        {
            label: "Valore medio ordine",
            icon: Receipt,
            value: data ? formatEur(data.avg_order_value) : "—",
            current: data?.avg_order_value ?? 0,
            previous: previous?.avg_order_value,
            invert: false,
            sub: undefined as string | undefined
        },
        {
            label: "Tasso annullamento",
            icon: XCircle,
            value: data ? `${data.cancellation_rate.toFixed(1)}%` : "—",
            current: data?.cancellation_rate ?? 0,
            previous: previous?.cancellation_rate,
            invert: true,
            // Base esplicita: denominatore = ordini validi + annullati (scoped),
            // così la % non sembra in contraddizione con la card "Ordini".
            sub: data
                ? `${data.cancelled_count} annullati su ${data.orders_count + data.cancelled_count}`
                : undefined
        }
    ];

    return (
        <div className={styles.kpiGrid}>
            {cards.map(({ label, icon: Icon, value, current, previous: prev, invert, sub }) => (
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
                                invert={invert}
                            />
                        </>
                    )}
                </div>
            ))}
        </div>
    );
}
