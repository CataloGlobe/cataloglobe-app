import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import PublicSheet from "../PublicSheet/PublicSheet";
import type { SubmitOrderResult } from "@/types/orders";
import styles from "./OrderConfirmationSheet.module.scss";

interface Props {
    isOpen: boolean;
    order: SubmitOrderResult | null;
    onClose: () => void;
    onViewMyOrders: () => void;
    /** Order-level note typed by customer pre-submit. Echoed read-only here. */
    orderNote?: string | null;
}

function formatPrice(n: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(n);
}

export default function OrderConfirmationSheet({
    isOpen,
    order,
    onClose,
    onViewMyOrders,
    orderNote
}: Props) {
    const { t } = useTranslation("public");
    const total = order?.total_amount ?? 0;
    const items = order?.items ?? [];

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel={t("order_confirmation.aria")}>
            <div className={styles.container}>
                <div className={styles.iconWrap}>
                    <Check size={48} strokeWidth={3} />
                </div>
                <h2 className={styles.title}>{t("order_confirmation.title")}</h2>
                <p className={styles.subtitle}>
                    {t("order_confirmation.subtitle")}
                </p>

                {items.length > 0 && (
                    <div className={styles.itemsBlock}>
                        <h3 className={styles.itemsTitle}>{t("order_confirmation.summary")}</h3>
                        <ul className={styles.itemsList}>
                            {items.map((item, idx) => (
                                <li key={`${item.product_id ?? "x"}-${idx}`} className={styles.itemEntry}>
                                    <div className={styles.itemRow}>
                                        <span className={styles.itemQty}>{item.quantity}x</span>
                                        <span className={styles.itemName}>{item.product_name_snapshot}</span>
                                        <span className={styles.itemPrice}>{formatPrice(item.line_total)}</span>
                                    </div>
                                    {item.item_notes && (
                                        <div className={styles.itemNoteRecap}>
                                            “{item.item_notes}”
                                        </div>
                                    )}
                                </li>
                            ))}
                        </ul>
                        <div className={styles.totalRow}>
                            <span>{t("ordering.total")}</span>
                            <span>{formatPrice(total)}</span>
                        </div>
                        {orderNote && (
                            <div className={styles.orderNoteRecap}>
                                <div className={styles.orderNoteRecapLabel}>
                                    {t("ordering.order_note_label")}
                                </div>
                                <div className={styles.orderNoteRecapText}>
                                    “{orderNote}”
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className={styles.actions}>
                    <button
                        type="button"
                        className={styles.btnPrimary}
                        onClick={onViewMyOrders}
                    >
                        {t("order_confirmation.my_orders")}
                    </button>
                    <button
                        type="button"
                        className={styles.btnSecondary}
                        onClick={onClose}
                    >
                        {t("order_confirmation.close")}
                    </button>
                </div>
            </div>
        </PublicSheet>
    );
}
