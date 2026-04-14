import type { FeaturedPerformanceData } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: FeaturedPerformanceData[];
    isLoading: boolean;
};

const slotLabels: Record<string, string> = {
    hero: "Hero",
    before_catalog: "Prima del catalogo",
    after_catalog: "Dopo il catalogo"
};

function getSlotLabel(slot: string): string {
    return slotLabels[slot] || slot;
}

export default function FeaturedPerformance({ data, isLoading }: Props) {
    return (
        <article className={styles.chartCard} aria-label="Contenuti in evidenza">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Contenuti in evidenza
                </Text>
            </header>
            <div className={styles.chartCardBody}>
                {isLoading ? (
                    <div className={styles.tableSkeletons}>
                        {Array.from({ length: 5 }, (_, i) => (
                            <Skeleton key={i} height="36px" radius="8px" />
                        ))}
                    </div>
                ) : data.length === 0 ? (
                    <div className={styles.chartEmpty}>
                        <Text variant="body" colorVariant="muted">
                            Nessun click su contenuti in evidenza nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <table className={styles.topTable}>
                        <thead>
                            <tr>
                                <th className={styles.topTableRank}>#</th>
                                <th className={styles.topTableName}>Titolo contenuto</th>
                                <th className={styles.topTableName}>Posizione</th>
                                <th className={styles.topTableCount}>Click</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, i) => (
                                <tr key={`${item.title}-${item.slot}-${i}`}>
                                    <td className={styles.topTableRank}>{i + 1}</td>
                                    <td className={styles.topTableName}>{item.title}</td>
                                    <td className={styles.topTableName}>
                                        <span className={styles.slotBadge}>
                                            {getSlotLabel(item.slot)}
                                        </span>
                                    </td>
                                    <td className={styles.topTableCount}>{item.click_count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </article>
    );
}
