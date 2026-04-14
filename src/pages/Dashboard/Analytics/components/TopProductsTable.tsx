import type { TopProduct } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import styles from "../Analytics.module.scss";

type Props = {
    title: string;
    data: TopProduct[];
    countLabel: string;
    isLoading: boolean;
};

export default function TopProductsTable({ title, data, countLabel, isLoading }: Props) {
    return (
        <article className={styles.chartCard} aria-label={title}>
            <header className={styles.chartCardHeader}>
                <Text variant="title-sm" align="left">
                    {title}
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
                            Nessun dato per il periodo selezionato
                        </Text>
                    </div>
                ) : (
                    <table className={styles.topTable}>
                        <thead>
                            <tr>
                                <th className={styles.topTableRank}>#</th>
                                <th className={styles.topTableName}>Prodotto</th>
                                <th className={styles.topTableCount}>{countLabel}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.map((item, i) => (
                                <tr key={item.product_name}>
                                    <td className={styles.topTableRank}>{i + 1}</td>
                                    <td className={styles.topTableName}>{item.product_name}</td>
                                    <td className={styles.topTableCount}>{item.count}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </article>
    );
}
