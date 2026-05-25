import { Check } from "lucide-react";
import PublicSheet from "../PublicSheet/PublicSheet";
import type { SubmitOrderResult } from "@/types/orders";
import styles from "./OrderConfirmationSheet.module.scss";

interface Props {
    isOpen: boolean;
    order: SubmitOrderResult | null;
    onClose: () => void;
    onViewMyOrders: () => void;
}

function formatPrice(n: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(n);
}

export default function OrderConfirmationSheet({ isOpen, order, onClose, onViewMyOrders }: Props) {
    const total = order?.total_amount ?? 0;
    const items = order?.items ?? [];

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel="Ordine inviato">
            <div className={styles.container}>
                <div className={styles.iconWrap}>
                    <Check size={48} strokeWidth={3} />
                </div>
                <h2 className={styles.title}>Ordine inviato!</h2>
                <p className={styles.subtitle}>
                    Lo staff prenderà in carico il tuo ordine a breve.
                </p>

                {items.length > 0 && (
                    <div className={styles.itemsBlock}>
                        <h3 className={styles.itemsTitle}>Riepilogo</h3>
                        <ul className={styles.itemsList}>
                            {items.map((item, idx) => (
                                <li key={`${item.product_id ?? "x"}-${idx}`} className={styles.itemRow}>
                                    <span className={styles.itemQty}>{item.quantity}x</span>
                                    <span className={styles.itemName}>{item.product_name_snapshot}</span>
                                    <span className={styles.itemPrice}>{formatPrice(item.line_total)}</span>
                                </li>
                            ))}
                        </ul>
                        <div className={styles.totalRow}>
                            <span>Totale</span>
                            <span>{formatPrice(total)}</span>
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={onViewMyOrders}
                    >
                        I miei ordini
                    </button>
                    <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={onClose}
                    >
                        Chiudi
                    </button>
                </div>
            </div>
        </PublicSheet>
    );
}
