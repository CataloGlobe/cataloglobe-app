import { ChefHat, Truck, Timer } from "lucide-react";
import type { OrdersLatency } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { formatDuration } from "../utils/ordersFormat";
import styles from "../Analytics.module.scss";

type Props = {
    data: OrdersLatency | null;
    isLoading: boolean;
};

export default function OrdersLatencyCard({ data, isLoading }: Props) {
    const rows = data
        ? [
              {
                  key: "prep",
                  label: "Preparazione",
                  icon: ChefHat,
                  avg: data.avg_prep_seconds,
                  median: data.median_prep_seconds
              },
              {
                  key: "delivery",
                  label: "Consegna",
                  icon: Truck,
                  avg: data.avg_delivery_seconds,
                  median: data.median_delivery_seconds
              },
              {
                  key: "total",
                  label: "Totale",
                  icon: Timer,
                  avg: data.avg_total_seconds,
                  median: data.median_total_seconds
              }
          ]
        : [];

    const noData = !isLoading && (!data || data.delivered_count === 0);

    return (
        <article className={styles.chartCard} aria-label="Tempi operativi">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Tempi operativi
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <div className={styles.tableSkeletons}>
                        {Array.from({ length: 3 }, (_, i) => (
                            <Skeleton key={i} height="52px" radius="8px" />
                        ))}
                    </div>
                ) : noData ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun ordine consegnato nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <div className={styles.latencyContent}>
                        <div className={styles.latencyGrid}>
                            {rows.map(({ key, label, icon: Icon, avg, median }) => (
                                <div key={key} className={styles.latencyRow}>
                                    <div className={styles.latencyLabel}>
                                        <Icon size={16} strokeWidth={1.75} className={styles.kpiIcon} />
                                        <Text variant="body" weight={500}>
                                            {label}
                                        </Text>
                                    </div>
                                    <div className={styles.latencyMetrics}>
                                        <div className={styles.latencyMetric}>
                                            <Text variant="caption" colorVariant="muted">
                                                Media
                                            </Text>
                                            <Text variant="body" weight={600}>
                                                {formatDuration(avg)}
                                            </Text>
                                        </div>
                                        <div className={styles.latencyMetric}>
                                            <Text variant="caption" colorVariant="muted">
                                                Mediana
                                            </Text>
                                            <Text variant="body" weight={600}>
                                                {formatDuration(median)}
                                            </Text>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {data && (
                            <div className={styles.latencyNote}>
                                <Text variant="caption" colorVariant="muted">
                                    Calcolato su {data.delivered_count}{" "}
                                    {data.delivered_count === 1 ? "ordine consegnato" : "ordini consegnati"}.
                                    {data.skipped_ready_count > 0 && (
                                        <>
                                            {" "}
                                            {data.skipped_ready_count}{" "}
                                            {data.skipped_ready_count === 1 ? "è stato consegnato" : "sono stati consegnati"}{" "}
                                            direttamente (senza passare da "Pronto"): escluso dai tempi di
                                            preparazione e consegna.
                                        </>
                                    )}
                                </Text>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}
