import { forwardRef } from "react";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./PrintReceipt.module.scss";

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
});

function formatAbsolute(iso: string): string {
    return DATETIME_FORMATTER.format(new Date(iso));
}

interface Props {
    order: V2OrderWithItems;
    tableLabel: string;
    tableZone: string | null;
    operatorNames?: Map<string, string>;
}

/**
 * Print-only receipt for kitchen ticket (72mm thermal roll).
 * Hidden on screen (display:none). Caller sets data-printing="true" on the
 * forwarded ref before calling window.print() so @media print reveals only
 * this specific receipt when multiple cards are mounted simultaneously.
 */
const PrintReceipt = forwardRef<HTMLDivElement, Props>(
    ({ order, tableLabel, tableZone, operatorNames }, ref) => {
        const operatorLabel = order.created_by_user_id
            ? (operatorNames?.get(order.created_by_user_id) ?? "Staff")
            : null;

        return (
            <div ref={ref} className={styles.printReceipt}>
                <div className={styles.prTitle}>COMANDA</div>
                <div className={styles.prTable}>
                    TAVOLO {tableLabel}
                    {tableZone ? ` · ${tableZone}` : ""}
                </div>
                <div className={styles.prMeta}>
                    <div>{formatAbsolute(order.submitted_at)}</div>
                    {operatorLabel && <div>Operatore: {operatorLabel}</div>}
                    {!order.created_by_user_id && order.customer_name_snapshot && (
                        <div>Cliente: {order.customer_name_snapshot}</div>
                    )}
                </div>
                {order.is_rectification && (
                    <div className={styles.prRectification}>*** RETTIFICA ***</div>
                )}
                <div className={styles.prDivider} />
                <div className={styles.prItems}>
                    {(order.items ?? []).map(item => (
                        <div key={item.id} className={styles.prItem}>
                            <div className={styles.prItemLine}>
                                <span className={styles.prQty}>{item.quantity}x</span>
                                <span className={styles.prName}>
                                    {item.product_name_snapshot}
                                </span>
                            </div>
                            {item.options_snapshot.primary_option && (
                                <div className={styles.prDetail}>
                                    {item.options_snapshot.primary_option.value_name}
                                </div>
                            )}
                            {item.options_snapshot.addons.map((addon, idx) => (
                                <div
                                    key={`${addon.value_id}-${idx}`}
                                    className={styles.prDetail}
                                >
                                    + {addon.value_name}
                                </div>
                            ))}
                            {item.item_notes && (
                                <div className={styles.prItemNote}>
                                    • {item.item_notes}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className={styles.prDivider} />
                {order.notes && (
                    <div className={styles.prOrderNotes}>Note: {order.notes}</div>
                )}
                <div className={styles.prFooter}>#{order.id.slice(0, 8).toUpperCase()}</div>
            </div>
        );
    }
);

PrintReceipt.displayName = "PrintReceipt";

export default PrintReceipt;
