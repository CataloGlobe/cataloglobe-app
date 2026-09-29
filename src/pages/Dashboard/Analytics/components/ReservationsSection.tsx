import { Card } from "@/components/ui/Card/Card";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import Text from "@/components/ui/Text/Text";
import { TrendChart } from "@/components/ui/TrendChart/TrendChart";
import type {
    ReservationsHourlyPoint,
    ReservationsOverview,
    ReservationsTrendPoint
} from "@/services/supabase/analytics";
import { fillDaily, fillHourly, formatHour } from "../utils/analyticsSeries";
import { calculateDelta, type DateRange, type PeriodKey } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

type Props = {
    overview: ReservationsOverview | null;
    previous: ReservationsOverview | null;
    trend: ReservationsTrendPoint[];
    hourly: ReservationsHourlyPoint[];
    dateRange: DateRange;
    period: PeriodKey;
    previousPeriodLabel: string;
};

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/**
 * Prenotazioni ricevute nel periodo (base `created_at`): quattro cifre,
 * prenotazioni e coperti in due grafici sulla stessa x (§36.2/3), le fasce.
 * Le tre card «Presto» escono (A4): promettevano metriche su dati che si
 * registrano già.
 */
export default function ReservationsSection({ overview, previous, trend, hourly, dateRange, period, previousPeriodLabel }: Props) {
    const r = overview;
    const deltaOf = (current: number, prev: number | undefined) => {
        if (prev == null) return undefined;
        const value = calculateDelta(current, prev);
        return value == null ? undefined : { value, period: `vs ${previousPeriodLabel}` };
    };
    return (
        <section className={styles.section} aria-label="Prenotazioni">
            <Text as="h2" variant="title-sm" weight={600}>
                Prenotazioni
            </Text>

            <div className={styles.statGrid}>
                <StatCard
                    label="Prenotazioni"
                    value={nf.format(r?.reservations_count ?? 0)}
                    delta={deltaOf(r?.reservations_count ?? 0, previous?.reservations_count)}
                />
                <StatCard label="Coperti" value={nf.format(r?.covers ?? 0)} delta={deltaOf(r?.covers ?? 0, previous?.covers)} />
                <StatCard label="Confermate" value={nf.format(r?.confirmed_count ?? 0)}>
                    <Text as="p" variant="caption" colorVariant="muted">
                        {nf.format(r?.confirm_rate ?? 0)}% · {r?.declined_count ?? 0} rifiutate · {r?.cancelled_count ?? 0} annullate
                    </Text>
                </StatCard>
                <StatCard label="Online / a mano" value={`${r?.online_count ?? 0} / ${r?.manual_count ?? 0}`}>
                    <Text as="p" variant="caption" colorVariant="muted">
                        ricevute online / inserite a mano
                    </Text>
                </StatCard>
            </div>

            <div className={styles.grid}>
                <Card title="Prenotazioni nel tempo">
                    <TrendChart
                        aria-label="Prenotazioni nel tempo"
                        variant="bars"
                        data={fillDaily(trend.map(p => ({ date: p.date, value: p.reservations_count })), dateRange, period)}
                        emptyTitle="Nessuna prenotazione nel periodo"
                    />
                </Card>
                <Card title="Coperti nel tempo">
                    <TrendChart
                        aria-label="Coperti nel tempo"
                        data={fillDaily(trend.map(p => ({ date: p.date, value: p.covers })), dateRange, period)}
                        emptyTitle="Nessun coperto nel periodo"
                    />
                </Card>
            </div>

            <Card title="Prenotazioni per fascia oraria">
                <TrendChart
                    aria-label="Prenotazioni per fascia oraria"
                    variant="bars"
                    data={fillHourly(hourly.map(h => ({ hour: h.hour, value: h.reservations_count })))}
                    formatDate={formatHour}
                    emptyTitle="Nessuna prenotazione nel periodo"
                />
            </Card>
        </section>
    );
}
