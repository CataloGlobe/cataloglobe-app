import { RotateCcw } from "lucide-react";
import type { HistoryRow } from "./historyColumns";
import styles from "./StornoStrip.module.scss";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

/**
 * Sotto-riga storno dello Storico: NON è una riga del DataTable, ma vive
 * DENTRO il blocco del padre (rowWrapper) allineata alla gabbia delle
 * colonne. Il box esterno parte sotto «Tavolo» e si ferma a fine «Totale»
 * (mai dentro il kebab). Niente netto qui: è nella colonna Totale del padre.
 *   ↳  ⟲ Storno · <articoli> · <motivo>                          −<importo>
 */
export function StornoStrip({ storno }: { storno: HistoryRow }) {
    const items = (storno.items ?? []).map(it => `${it.quantity}× ${it.product_name_snapshot}`).join(", ");
    return (
        <div className={styles.stornoStripRow}>
            <div className={styles.stornoStrip}>
                <div className={styles.stornoStripLeft}>
                    <span className={styles.stornoStripArrow} aria-hidden>
                        ↳
                    </span>
                    <RotateCcw size={12} aria-hidden className={styles.stornoStripIcon} />
                    <span className={styles.stornoStripTag}>Storno</span>
                    {items && (
                        <>
                            <span className={styles.stornoStripSep} aria-hidden>
                                ·
                            </span>
                            <span className={styles.stornoStripItems}>{items}</span>
                        </>
                    )}
                    {storno.notes && (
                        <>
                            <span className={styles.stornoStripSep} aria-hidden>
                                ·
                            </span>
                            <span className={styles.stornoStripReason}>{storno.notes}</span>
                        </>
                    )}
                </div>
                <span className={styles.stornoStripAmount}>{CURRENCY_FORMATTER.format(-storno.total_amount)}</span>
            </div>
        </div>
    );
}
