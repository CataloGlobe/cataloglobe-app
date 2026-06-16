import type { TopOrderedProduct } from "@/services/supabase/analytics";
import Skeleton from "@/components/ui/Skeleton/Skeleton";
import Text from "@/components/ui/Text/Text";
import { formatEur } from "../utils/ordersFormat";
import styles from "../Analytics.module.scss";

type Props = {
    title: string;
    data: TopOrderedProduct[];
    /** Which metric the ranking is by — highlights the matching column. */
    rankBy: "quantity" | "revenue";
    isLoading: boolean;
};

export default function OrdersTopProductsTable({ title, data, rankBy, isLoading }: Props) {
    // Colonna di ranking enfatizzata (brand); l'altra in colore neutro.
    const neutral = `${styles.topTableCount} ${styles.topTableCountNeutral}`;
    const qtyClass = rankBy === "quantity" ? styles.topTableCount : neutral;
    const revClass = rankBy === "revenue" ? styles.topTableCount : neutral;

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
                            Nessun ordine nel periodo selezionato
                        </Text>
                    </div>
                ) : (
                    // Wrapper: assorbe l'height:100% imposto da `.chartCardBody > *`,
                    // così la tabella mantiene altezza naturale e le righe restano
                    // impacchettate in alto (niente distribuzione verticale con poche
                    // righe). Le tabelle engagement non hanno wrapper → invariate.
                    <div className={styles.topTableWrap}>
                        <table className={styles.topTable}>
                            <thead>
                                <tr>
                                    <th className={styles.topTableRank}>#</th>
                                    <th className={styles.topTableName}>Prodotto</th>
                                    <th className={styles.topTableCount}>Qtà</th>
                                    <th className={styles.topTableCount}>Ricavi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((item, i) => (
                                    <tr key={item.product_name}>
                                        <td className={styles.topTableRank}>{i + 1}</td>
                                        <td className={styles.topTableName}>{item.product_name}</td>
                                        <td className={qtyClass}>{item.quantity}</td>
                                        <td className={revClass}>{formatEur(item.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </article>
    );
}
