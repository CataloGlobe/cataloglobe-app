import type { SearchTermData } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    data: SearchTermData[];
    isLoading: boolean;
};

export default function TopSearchTerms({ data, isLoading }: Props) {
    return (
        <article className={styles.chartCard} aria-label="Termini di ricerca">
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    Termini di ricerca
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
                            Nessuna ricerca nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <table className={styles.topTable}>
                        <thead>
                            <tr>
                                <th className={styles.topTableRank}>#</th>
                                <th className={styles.topTableName}>Termine di ricerca</th>
                                <th className={styles.topTableCount}>Ricerche</th>
                                <th className={styles.topTableCount}>Media risultati</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, i) => (
                                <tr key={`${item.search_term}-${i}`}>
                                    <td className={styles.topTableRank}>{i + 1}</td>
                                    <td className={styles.topTableName}>
                                        <span>"{item.search_term}"</span>
                                    </td>
                                    <td className={styles.topTableCount}>{item.search_count}</td>
                                    <td className={styles.topTableCount}>
                                        {item.avg_results === 0 ? (
                                            <span className={styles.zeroResults}>Nessun risultato</span>
                                        ) : (
                                            item.avg_results
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </article>
    );
}
