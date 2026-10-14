import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { formatPublicPrice } from "../price";
import { closeSheet } from "../sheets/sheetStack";
import { CancelOrder, OrderSteps } from "./OrderPage";
import { canCancelOrder, orderStep } from "./orderSend";
import type { SentReceipt } from "./useOrderSend";
import type { SessionOrdersState } from "./useSessionOrders";
import styles from "./OrderPage.module.scss";

/**
 * «Ordine N · Tavolo» dopo «Invia alla cucina» (mockup v38, `poOk`): spunta,
 * il titolo con lo stato di adesso, piatti e totale, le righe, lo stato dal vivo
 * con «Annulla ordine» finché la cucina non l'ha preso. «‹» torna a «Il tuo ordine»,
 * «Aggiungi altro» chiude il foglio.
 */
export default function OrderSentPage({ receipt, sessionOrders }: { receipt: SentReceipt; sessionOrders: SessionOrdersState }) {
    const { t } = useTranslation("public");
    const order = sessionOrders.orders?.find(candidate => candidate.id === receipt.orderId);
    // Finché la rilettura non lo porta, l'ordine è appena «Inviato».
    const step = order ? orderStep(order.status) : 0;
    const count = receipt.lines.reduce((sum, line) => sum + line.qty, 0);
    // Titolo e riga sotto la barra seguono lo stato; annullato tiene il titolo dell'invio.
    const title = [t("order_sheet.sent_ok"), t("order_sheet.title_kitchen"), t("order_sheet.title_ready"), t("order_sheet.enjoy")][Math.max(step, 0)];
    const hint = [null, t("order_sheet.in_kitchen"), t("order_sheet.hint_ready"), t("order_sheet.hint_served")][Math.max(step, 0)];
    return (
        <div className={styles.root}>
            <div className={styles.ok} role="status">
                <span className={styles.okCheck} aria-hidden="true">
                    <Check size={28} strokeWidth={2.6} />
                </span>
                <h3 className={styles.okTitle}>{title}</h3>
                <p className={styles.okMeta}>{t("order_sheet.sent_summary", { count, total: formatPublicPrice(receipt.total) })}</p>
            </div>
            <ul className={styles.summary}>
                {receipt.lines.map((line, index) => (
                    <li key={`${index}-${line.id}`}>
                        <span>{line.qty > 1 ? `${line.qty} × ${line.name}` : line.name}</span>
                        <span>{formatPublicPrice(line.unitPrice * line.qty)}</span>
                    </li>
                ))}
            </ul>
            <div className={styles.tracker}>
                {step < 0 ? (
                    <p className={styles.trackerHint}>{t("order_sheet.cancelled_note")}</p>
                ) : (
                    <>
                        <OrderSteps step={step} />
                        {order && canCancelOrder(order.status) ? (
                            <CancelOrder
                                cancelling={sessionOrders.cancellingId === order.id}
                                onCancel={() => sessionOrders.cancel(order.id)}
                            />
                        ) : hint ? (
                            <p className={styles.trackerHint}>{hint}</p>
                        ) : null}
                    </>
                )}
            </div>
            {sessionOrders.error ? (
                <p role="alert" className={styles.alert}>
                    {sessionOrders.error}
                </p>
            ) : null}
        </div>
    );
}

/** Piede della conferma: un solo pulsante, «Aggiungi altro», che riporta al menu. */
export function OrderSentFooter() {
    const { t } = useTranslation("public");
    return (
        <div className={styles.footer}>
            <button type="button" className={styles.send} onClick={closeSheet}>
                {t("order_sheet.add_more")}
            </button>
        </div>
    );
}
