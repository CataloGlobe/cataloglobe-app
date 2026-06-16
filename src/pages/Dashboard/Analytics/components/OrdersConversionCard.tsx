import type { OrdersConversion } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: OrdersConversion | null;
    isLoading: boolean;
};

export default function OrdersConversionCard({ data, isLoading }: Props) {
    return (
        <article className={styles.chartCard} aria-label="Tasso di conversione selezione → ordine">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Selezione → ordine
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <div className={styles.tableSkeletons}>
                        <Skeleton height="64px" radius="8px" />
                        <Skeleton height="40px" radius="8px" />
                    </div>
                ) : (
                    <div className={styles.conversionContent}>
                        <div className={styles.conversionBig}>
                            <Text variant="title-lg" weight={700}>
                                {data ? `${data.conversion_rate.toFixed(1)}%` : "—"}
                            </Text>
                            <Text variant="caption" colorVariant="muted">
                                tasso di conversione aggregato
                            </Text>
                        </div>

                        <div className={styles.conversionBreakdown}>
                            <div className={styles.conversionStat}>
                                <Text variant="title-sm" weight={600}>
                                    {data ? data.selection_sessions.toLocaleString("it-IT") : "—"}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    sessioni con selezione
                                </Text>
                            </div>
                            <div className={styles.conversionStat}>
                                <Text variant="title-sm" weight={600}>
                                    {data ? data.orders_count.toLocaleString("it-IT") : "—"}
                                </Text>
                                <Text variant="caption" colorVariant="muted">
                                    ordini inviati
                                </Text>
                            </div>
                        </div>

                        <div className={styles.latencyNote}>
                            <Text variant="caption" colorVariant="muted">
                                Stima aggregata per sede/periodo: rapporto tra ordini inviati e
                                sessioni che hanno aggiunto prodotti alla selezione. Non è un funnel
                                per singola sessione (i due dati non sono collegati).
                            </Text>
                        </div>
                    </div>
                )}
            </div>
        </article>
    );
}
