import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card/Card";
import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { StatCard } from "@/components/ui/StatCard/StatCard";
import Text from "@/components/ui/Text/Text";
import { TrendChart } from "@/components/ui/TrendChart/TrendChart";
import { formatPrice } from "@/utils/formatCurrency";
import type {
    OrdersConversion,
    OrdersHourlyPoint,
    OrdersLatency,
    OrdersOverview,
    OrdersTrendPoint,
    TopOrderedProduct
} from "@/services/supabase/analytics";
import { fillDaily, fillHourly, formatHour } from "../utils/analyticsSeries";
import { formatDuration } from "../utils/ordersFormat";
import { calculateDelta, isBelowSample, type DateRange, type PeriodKey } from "../utils/periodComparison";
import styles from "../Analytics.module.scss";

type Props = {
    overview: OrdersOverview | null;
    previous: OrdersOverview | null;
    trend: OrdersTrendPoint[];
    hourly: OrdersHourlyPoint[];
    topByQuantity: TopOrderedProduct[];
    topByRevenue: TopOrderedProduct[];
    latency: OrdersLatency | null;
    conversion: OrdersConversion | null;
    dateRange: DateRange;
    period: PeriodKey;
    previousPeriodLabel: string;
};

type RankBy = "quantity" | "revenue";

const nf = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 });

/**
 * Ordini al tavolo: transazioni contate. Quattro cifre col confronto (il
 * tasso di annullamento col delta invertito), ordini e incasso in due grafici
 * sulla stessa x — non più due assi y sullo stesso grafico (§36.2/3) — i
 * prodotti più ordinati, i tempi, la selezione che diventa ordine, le fasce.
 */
export default function OrdersSection({
    overview,
    previous,
    trend,
    hourly,
    topByQuantity,
    topByRevenue,
    latency,
    conversion,
    dateRange,
    period,
    previousPeriodLabel
}: Props) {
    const [rankBy, setRankBy] = useState<RankBy>("quantity");
    const deltaOf = (current: number, prev: number | undefined, invert = false) => {
        if (prev == null) return undefined;
        const value = calculateDelta(current, prev);
        return value == null ? undefined : { value, period: `vs ${previousPeriodLabel}`, invert };
    };

    const columns = useMemo<ColumnDefinition<TopOrderedProduct>[]>(
        () => [
            { id: "product", header: "Prodotto", width: "minmax(0, 2fr)", accessor: row => row.product_name },
            { id: "quantity", header: "Quantità", width: "100px", align: "right", accessor: row => row.quantity },
            {
                id: "revenue",
                header: "Ricavi",
                width: "120px",
                align: "right",
                cell: (_, row) => <Text variant="body-sm">{formatPrice(row.revenue)}</Text>
            }
        ],
        []
    );

    const o = overview;
    const latencyRows = latency
        ? [
              { label: "Preparazione", avg: latency.avg_prep_seconds, median: latency.median_prep_seconds },
              { label: "Consegna", avg: latency.avg_delivery_seconds, median: latency.median_delivery_seconds },
              { label: "Totale", avg: latency.avg_total_seconds, median: latency.median_total_seconds }
          ]
        : [];
    const selections = conversion?.selection_sessions ?? 0;

    return (
        <section className={styles.section} aria-label="Ordini al tavolo">
            <Text as="h2" variant="title-sm" weight={600}>
                Ordini al tavolo
            </Text>

            <div className={styles.statGrid}>
                <StatCard label="Ordini" value={nf.format(o?.orders_count ?? 0)} delta={deltaOf(o?.orders_count ?? 0, previous?.orders_count)} />
                <StatCard label="Ricavi" value={formatPrice(o?.revenue ?? 0)} delta={deltaOf(o?.revenue ?? 0, previous?.revenue)} />
                <StatCard
                    label="Valore medio ordine"
                    value={formatPrice(o?.avg_order_value ?? 0)}
                    delta={deltaOf(o?.avg_order_value ?? 0, previous?.avg_order_value)}
                />
                <StatCard
                    label="Tasso di annullamento"
                    value={`${nf.format(o?.cancellation_rate ?? 0)}%`}
                    delta={deltaOf(o?.cancellation_rate ?? 0, previous?.cancellation_rate, true)}
                >
                    {/* Base esplicita: ordini validi + annullati, così la % non
                        sembra in contraddizione con la cifra «Ordini». */}
                    <Text as="p" variant="caption" colorVariant="muted">
                        {o?.cancelled_count ?? 0} annullati su {(o?.orders_count ?? 0) + (o?.cancelled_count ?? 0)}
                    </Text>
                </StatCard>
            </div>

            <div className={styles.grid}>
                <Card title="Ordini nel tempo">
                    <TrendChart
                        aria-label="Ordini nel tempo"
                        variant="bars"
                        data={fillDaily(trend.map(p => ({ date: p.date, value: p.orders_count })), dateRange, period)}
                        emptyTitle="Nessun ordine nel periodo"
                    />
                </Card>
                <Card title="Ricavi nel tempo">
                    <TrendChart
                        aria-label="Ricavi nel tempo"
                        data={fillDaily(trend.map(p => ({ date: p.date, value: p.revenue })), dateRange, period)}
                        formatValue={formatPrice}
                        emptyTitle="Nessun ricavo nel periodo"
                    />
                </Card>
            </div>

            <Card
                title="Prodotti più ordinati"
                flush
                actions={
                    <SegmentedControl<RankBy>
                        size="sm"
                        value={rankBy}
                        onChange={setRankBy}
                        options={[
                            { value: "quantity", label: "Per quantità" },
                            { value: "revenue", label: "Per ricavi" }
                        ]}
                    />
                }
            >
                <DataTable<TopOrderedProduct>
                    ariaLabel="Prodotti più ordinati"
                    data={rankBy === "quantity" ? topByQuantity : topByRevenue}
                    columns={columns}
                    getRowId={row => row.product_name}
                    emptyState={{ title: "Nessun prodotto ordinato nel periodo" }}
                />
            </Card>

            <div className={styles.grid}>
                <Card title="Tempi operativi" flush={latencyRows.length > 0 && (latency?.delivered_count ?? 0) > 0}>
                    {!latency || latency.delivered_count === 0 ? (
                        <Text variant="body-sm" colorVariant="muted">
                            Nessun ordine consegnato nel periodo.
                        </Text>
                    ) : (
                        <>
                            {latencyRows.map(row => (
                                <ListRow
                                    key={row.label}
                                    title={row.label}
                                    meta={
                                        <Text as="span" variant="body-sm">
                                            media {formatDuration(row.avg)} · mediana {formatDuration(row.median)}
                                        </Text>
                                    }
                                    metaInline
                                />
                            ))}
                            <Text as="p" variant="caption" colorVariant="muted" className={styles.cardNote}>
                                Su {latency.delivered_count} {latency.delivered_count === 1 ? "ordine consegnato" : "ordini consegnati"}.
                                {latency.skipped_ready_count > 0 &&
                                    ` ${latency.skipped_ready_count} ${latency.skipped_ready_count === 1 ? "è stato consegnato" : "sono stati consegnati"} direttamente (senza passare da «Pronto»): esclusi dai tempi di preparazione e consegna.`}
                            </Text>
                        </>
                    )}
                </Card>
                <StatCard
                    label="Dalla selezione all'ordine"
                    value={isBelowSample(selections) ? nf.format(conversion?.orders_count ?? 0) : `${nf.format(conversion?.conversion_rate ?? 0)}%`}
                >
                    {/* Sotto soglia il numero è quello degli ordini: la
                        percentuale su poche visite direbbe il caso (§36.1/3). */}
                    <Text as="p" variant="body-sm">
                        {conversion?.orders_count ?? 0} ordini da {selections} {selections === 1 ? "visita" : "visite"} con una selezione
                    </Text>
                    <Text as="p" variant="caption" colorVariant="muted">
                        Ordini inviati rispetto alle visite con una selezione: una stima d&apos;insieme, non un percorso per
                        singola visita (i due dati non sono collegati).
                    </Text>
                </StatCard>
            </div>

            <Card title="Ordini per fascia oraria">
                <TrendChart
                    aria-label="Ordini per fascia oraria"
                    variant="bars"
                    data={fillHourly(hourly.map(h => ({ hour: h.hour, value: h.orders_count })))}
                    formatDate={formatHour}
                    emptyTitle="Nessun ordine nel periodo"
                />
            </Card>
        </section>
    );
}
