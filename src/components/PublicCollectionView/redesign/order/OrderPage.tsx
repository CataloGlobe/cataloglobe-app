import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellRing, ChefHat, Clock, Minus, Plus, Trash2, Utensils, type LucideIcon } from "lucide-react";
import AssistanceActions from "@components/PublicCollectionView/AssistanceActions/AssistanceActions";
import type { CollectionViewSectionItem } from "@components/PublicCollectionView/CollectionView/CollectionView";
import type { SelectionItem } from "@components/PublicCollectionView/OrderingSheet/OrderingSheet";
import type { SessionOrderSummary } from "@/types/orders";
import type { OrderingContext } from "../slots";
import { formatPublicPrice } from "../price";
import { LINE_QTY_MAX } from "./orderDraft";
import { pushOrderLineEdit } from "./orderSheet";
import {
    canCancelOrder,
    isBareTableNumber,
    isLineUnavailable,
    ORDER_NOTE_MAX,
    ORDER_STEPS,
    orderStep,
    selectionTotal
} from "./orderSend";
import type { OrderSendState } from "./useOrderSend";
import type { SessionOrdersState } from "./useSessionOrders";
import styles from "./OrderPage.module.scss";

type FindProduct = (productId: string) => CollectionViewSectionItem | null;

const TITLE_ID = "order-sheet-title";
const TO_SEND_ID = "order-sheet-to-send";
const removeId = (index: number) => `order-line-${index}-remove`;

const STEP_KEYS: Record<(typeof ORDER_STEPS)[number], string> = {
    submitted: "ordering.step_sent",
    acknowledged: "ordering.step_kitchen",
    ready: "ordering.step_ready",
    delivered: "order_sheet.step_served"
};

/** Un'icona per stato, dentro il cerchio (come lo stepper di prima, scelto da Lorenzo il 2026-10-14). */
const STEP_ICONS: Record<(typeof ORDER_STEPS)[number], LucideIcon> = {
    submitted: Clock,
    acknowledged: ChefHat,
    ready: BellRing,
    delivered: Utensils
};

type Props = {
    ordering: OrderingContext | undefined;
    findProduct: FindProduct;
    /** «Modifica» c'è solo quando la scheda si apre in modo ordine. */
    canEdit: boolean;
    sendState: OrderSendState;
    /** Gli ordini del tavolo, letti una volta per il foglio (anche la conferma li usa). */
    sessionOrders: SessionOrdersState;
};

/**
 * «Il tuo ordine · Tavolo N» nel foglio unico (spec §7): le righe da inviare
 * (quantità, Modifica, Rimuovi), «Note per la cucina», gli ordini già inviati con lo stato fino a
 * Servito e «Annulla ordine» finché la cucina non l'ha preso, poi conto e
 * cameriere. Si paga al tavolo o in cassa.
 */
export default function OrderPage(props: Props) {
    const { t } = useTranslation("public");
    // La sessione del tavolo è finita mentre il foglio era aperto.
    if (!props.ordering)
        return (
            <p role="alert" className={styles.alert}>
                {t("ordering.err_session_expired_table")}
            </p>
        );
    return <OrderContent {...props} ordering={props.ordering} />;
}

function OrderContent({ ordering, findProduct, canEdit, sendState, sessionOrders }: Props & { ordering: OrderingContext }) {
    const { t } = useTranslation("public");
    const { orders, error, cancellingId, cancel } = sessionOrders;
    const titleRef = useRef<HTMLHeadingElement>(null);
    const { selection } = ordering;

    const remove = (index: number) => {
        ordering.remove(index);
        // Il pulsante toccato se ne va con la riga: il fuoco passa al titolo della lista.
        requestAnimationFrame(() => (document.getElementById(TO_SEND_ID) ?? titleRef.current)?.focus());
    };

    const message = sendState.failure ?? ordering.blockedMessage;
    const label = ordering.tableLabel?.trim();
    const table = label ? (isBareTableNumber(label) ? t("order_sheet.table", { label }) : label) : null;
    const isEmpty = selection.length === 0 && orders?.length === 0;

    return (
        <div className={styles.root}>
            <h2 ref={titleRef} id={TITLE_ID} className={styles.title} tabIndex={-1}>
                {t("ordering.title")}
                {table ? <span className={styles.table}> · {table}</span> : null}
            </h2>
            {message ? (
                <p role="alert" className={styles.alert}>
                    {message}
                </p>
            ) : null}

            {selection.length > 0 ? (
                <section className={styles.section} aria-labelledby={TO_SEND_ID}>
                    <h3 id={TO_SEND_ID} className={styles.heading} tabIndex={-1}>
                        {t("order_sheet.to_send")}
                    </h3>
                    <ul className={styles.list}>
                        {selection.map((line, index) => (
                            <SelectionLine
                                key={`${index}-${line.id}`}
                                line={line}
                                index={index}
                                unavailable={isLineUnavailable(findProduct, line, sendState.refused)}
                                canEdit={canEdit}
                                onQty={qty => ordering.setQty(index, qty)}
                                onRemove={() => remove(index)}
                            />
                        ))}
                    </ul>
                    <OrderNote note={ordering.note} onChange={ordering.setNote} />
                    <div className={styles.totalRow}>
                        <span>{t("ordering.total")}</span>
                        <span>{formatPublicPrice(selectionTotal(selection))}</span>
                    </div>
                    <p className={styles.payHint}>{t("order_sheet.pay_hint")}</p>
                </section>
            ) : null}

            {orders === null ? <p className={styles.muted}>{t("ordering.loading_orders")}</p> : null}
            {orders && orders.length > 0 ? (
                <section className={styles.section} aria-labelledby="order-sheet-sent">
                    <h3 id="order-sheet-sent" className={styles.heading}>
                        {[
                            t("order_sheet.sent_title"),
                            table,
                            t("order_sheet.orders_count", { count: orders.length })
                        ]
                            .filter(Boolean)
                            .join(" · ")}
                    </h3>
                    <ul className={styles.list}>
                        {orders.map(order => (
                            <SentOrder
                                key={order.id}
                                order={order}
                                cancelling={cancellingId === order.id}
                                onCancel={() => cancel(order.id)}
                            />
                        ))}
                    </ul>
                </section>
            ) : null}
            {error ? (
                <p role="alert" className={styles.alert}>
                    {error}
                </p>
            ) : null}

            {isEmpty ? (
                <div className={styles.empty}>
                    <p className={styles.emptyTitle}>{t("ordering.empty_cart_title")}</p>
                    <p className={styles.muted}>{t("ordering.empty_cart_hint")}</p>
                </div>
            ) : null}

            {ordering.jwt ? (
                <section className={styles.section} aria-labelledby="order-sheet-assist">
                    <h3 id="order-sheet-assist" className={styles.heading}>
                        {t("order_sheet.at_table")}
                    </h3>
                    <AssistanceActions
                        layout="tiles"
                        billRequestedAt={ordering.billRequestedAt}
                        onBillRequestedAtChange={ordering.onBillRequestedAtChange}
                        waiterCalledAt={ordering.waiterCalledAt}
                        onWaiterCalledAtChange={ordering.onWaiterCalledAtChange}
                        ordersRefreshKey={ordering.refreshKey}
                        hasInProgressOrders={orders ? orders.some(order => order.status === "submitted" || order.status === "acknowledged") : undefined}
                    />
                </section>
            ) : null}
        </div>
    );
}

function SelectionLine({
    line,
    index,
    unavailable,
    canEdit,
    onQty,
    onRemove
}: {
    line: SelectionItem;
    index: number;
    unavailable: boolean;
    canEdit: boolean;
    onQty: (qty: number) => void;
    onRemove: () => void;
}) {
    const { t } = useTranslation("public");
    const choices = [line.selectedFormat?.name, ...(line.selectedAddons ?? []).map(addon => addon.name)].filter(Boolean).join(", ");
    return (
        <li className={styles.line} data-unavailable={unavailable ? "" : undefined}>
            <div className={styles.lineHead}>
                <span className={styles.lineName}>{line.name}</span>
                <span className={styles.linePrice}>{formatPublicPrice(line.unitPrice * line.qty)}</span>
            </div>
            {choices ? <p className={styles.lineMeta}>{choices}</p> : null}
            {line.note ? <p className={styles.lineNote}>{line.note}</p> : null}
            {unavailable ? (
                <div className={styles.lineActions}>
                    <span className={styles.unavailable}>{t("order_sheet.unavailable")}</span>
                    <button
                        id={removeId(index)}
                        type="button"
                        className={styles.textButton}
                        aria-label={t("order_sheet.remove_aria", { name: line.name })}
                        onClick={onRemove}
                    >
                        {t("order_sheet.remove")}
                    </button>
                </div>
            ) : (
                <div className={styles.lineActions}>
                    {canEdit ? (
                        <button
                            type="button"
                            className={styles.textButton}
                            aria-label={t("order_sheet.edit_aria", { name: line.name })}
                            onClick={() => pushOrderLineEdit(index, line.id, line.name)}
                        >
                            {t("selection.edit")}
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className={styles.stepper} role="group" aria-label={t("order_sheet.qty_aria", { name: line.name })}>
                        {/* A uno il meno toglie la riga: lo dice icona e nome. */}
                        <button
                            type="button"
                            className={styles.step}
                            aria-label={line.qty <= 1 ? t("order_sheet.remove_aria", { name: line.name }) : t("selection.decrease_aria")}
                            onClick={() => (line.qty <= 1 ? onRemove() : onQty(line.qty - 1))}
                        >
                            {line.qty <= 1 ? <Trash2 size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
                        </button>
                        <output className={styles.qty} aria-live="polite">
                            {line.qty}
                        </output>
                        <button
                            type="button"
                            className={styles.step}
                            aria-label={t("selection.increase_aria")}
                            aria-disabled={line.qty >= LINE_QTY_MAX}
                            onClick={() => line.qty < LINE_QTY_MAX && onQty(line.qty + 1)}
                        >
                            <Plus size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>
            )}
        </li>
    );
}

function SentOrder({
    order,
    cancelling,
    onCancel
}: {
    order: SessionOrderSummary;
    cancelling: boolean;
    onCancel: () => Promise<boolean>;
}) {
    const { t, i18n } = useTranslation("public");
    const step = orderStep(order.status);
    const cancelled = step < 0;
    const time = new Intl.DateTimeFormat(i18n.language, { hour: "2-digit", minute: "2-digit" }).format(new Date(order.created_at));
    const current = cancelled ? t("order_sheet.cancelled") : t(STEP_KEYS[ORDER_STEPS[step]]);
    return (
        <li className={styles.order} data-cancelled={cancelled ? "" : undefined}>
            <div className={styles.orderHead}>
                <span>{t("order_sheet.sent_at", { time })}</span>
                <span className={styles.badge} data-step={cancelled ? "cancelled" : ORDER_STEPS[step]}>
                    {current}
                </span>
            </div>
            {cancelled ? null : <OrderSteps step={step} />}
            <ul className={styles.orderItems}>
                {order.items.map(item => {
                    const choices = [item.options_snapshot?.primary_option?.value_name, ...(item.options_snapshot?.addons ?? []).map(a => a.value_name)]
                        .filter(Boolean)
                        .join(", ");
                    return (
                        <li key={item.id} className={styles.orderItem} data-cancelled={item.cancelled_at ? "" : undefined}>
                            <span>
                                {item.quantity}× {item.product_name_snapshot}
                                {item.cancelled_at ? <span className={styles.srOnly}> ({t("order_sheet.cancelled")})</span> : null}
                            </span>
                            {choices ? <span className={styles.lineMeta}>{choices}</span> : null}
                            {item.item_notes ? <span className={styles.lineNote}>{item.item_notes}</span> : null}
                        </li>
                    );
                })}
            </ul>
            <div className={styles.orderTotal}>
                <span>{t("ordering.total")}</span>
                <span>{formatPublicPrice(order.total_amount)}</span>
            </div>
            {canCancelOrder(order.status) ? <CancelOrder cancelling={cancelling} onCancel={onCancel} /> : null}
        </li>
    );
}

/** I quattro passi dello stato, ognuno con la sua icona, quello attuale segnato (anche nella conferma). */
export function OrderSteps({ step }: { step: number }) {
    const { t } = useTranslation("public");
    return (
        <ol className={styles.steps} aria-label={t("order_sheet.status_aria")}>
            {ORDER_STEPS.map((status, i) => {
                const Icon = STEP_ICONS[status];
                return (
                    <li
                        key={status}
                        className={styles.stepItem}
                        data-state={i < step ? "done" : i === step ? "current" : "todo"}
                        aria-current={i === step ? "step" : undefined}
                    >
                        <span className={styles.stepDot} aria-hidden="true">
                            <Icon size={15} strokeWidth={2.2} />
                        </span>
                        {t(STEP_KEYS[status])}
                    </li>
                );
            })}
        </ol>
    );
}

/** «Annulla ordine» con la domanda di conferma, finché la cucina non l'ha preso. */
export function CancelOrder({ cancelling, onCancel }: { cancelling: boolean; onCancel: () => Promise<boolean> }) {
    const { t } = useTranslation("public");
    const [confirming, setConfirming] = useState(false);
    // Il pulsante toccato sparisce: il fuoco va su «No» all'apertura e torna su «Annulla ordine» alla chiusura.
    const noRef = useRef<HTMLButtonElement>(null);
    const askRef = useRef<HTMLButtonElement>(null);
    const [toggled, setToggled] = useState(false);
    useEffect(() => {
        if (!toggled) return;
        (confirming ? noRef : askRef).current?.focus();
    }, [confirming, toggled]);
    const confirm = (open: boolean) => {
        setToggled(true);
        setConfirming(open);
    };
    return confirming ? (
        <div className={styles.confirm} role="group" aria-label={t("ordering.cancel_confirm")}>
            <span>{t("ordering.cancel_confirm")}</span>
            <button ref={noRef} type="button" className={styles.textButton} disabled={cancelling} onClick={() => confirm(false)}>
                {t("ordering.no")}
            </button>
            <button
                type="button"
                className={styles.danger}
                disabled={cancelling}
                aria-busy={cancelling}
                onClick={() => void onCancel().then(done => done || confirm(false))}
            >
                {cancelling ? t("ordering.cancelling") : t("ordering.cancel_yes")}
            </button>
        </div>
    ) : (
        <button ref={askRef} type="button" className={styles.textButton} onClick={() => confirm(true)}>
            {t("ordering.cancel_order")}
        </button>
    );
}

/**
 * «Note per la cucina» per tutto l'ordine (mockup v38): un invito finché è
 * vuota, poi il campo con il conto dei caratteri.
 */
function OrderNote({ note, onChange }: { note: string | null; onChange: (note: string | null) => void }) {
    const { t } = useTranslation("public");
    const id = useId();
    const [open, setOpen] = useState(false);
    const fieldRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (open) fieldRef.current?.focus({ preventScroll: true });
    }, [open]);
    const value = note ?? "";
    return (
        <div className={styles.note}>
            <p className={styles.noteLabel} id={`${id}-label`}>
                {t("ordering.order_note_label")}
            </p>
            {open || value ? (
                <div className={styles.noteField}>
                    <textarea
                        ref={fieldRef}
                        className={styles.noteInput}
                        value={value}
                        maxLength={ORDER_NOTE_MAX}
                        rows={3}
                        placeholder={t("order_sheet.order_note_placeholder")}
                        aria-label={t("order_sheet.order_note_aria")}
                        onChange={event => onChange(event.target.value.slice(0, ORDER_NOTE_MAX) || null)}
                    />
                    <span className={styles.noteCount} aria-hidden="true">
                        {value.length}/{ORDER_NOTE_MAX}
                    </span>
                </div>
            ) : (
                <button type="button" className={styles.noteAdd} aria-describedby={`${id}-label`} onClick={() => setOpen(true)}>
                    <Plus size={16} aria-hidden="true" />
                    {t("order_sheet.order_note_add")}
                </button>
            )}
        </div>
    );
}

/** Piede della pagina (mockup v38): solo «Invia alla cucina · totale»; il totale sta nel corpo. */
export function OrderFooter({
    ordering,
    findProduct,
    sendState
}: {
    ordering: OrderingContext | undefined;
    findProduct: FindProduct;
    sendState: OrderSendState;
}) {
    const { t } = useTranslation("public");
    if (!ordering || ordering.selection.length === 0) return null;
    const firstUnavailable = ordering.selection.findIndex(line => isLineUnavailable(findProduct, line, sendState.refused));
    const label = sendState.sending
        ? t("ordering.submitting")
        : firstUnavailable >= 0
          ? t("order_sheet.remove_unavailable")
          : `${t("order_sheet.send")} · ${formatPublicPrice(selectionTotal(ordering.selection))}`;
    return (
        <div className={styles.footer}>
            <button
                type="button"
                className={styles.send}
                data-missing={firstUnavailable >= 0 ? "" : undefined}
                disabled={ordering.blockedMessage != null || sendState.sending}
                aria-busy={sendState.sending}
                onClick={() => {
                    if (firstUnavailable < 0) {
                        void sendState.send();
                        return;
                    }
                    // Toglie davvero i piatti non più disponibili, dall'ultimo così gli indici restano giusti.
                    const gone = ordering.selection.flatMap((line, index) =>
                        isLineUnavailable(findProduct, line, sendState.refused) ? [index] : []
                    );
                    for (const index of gone.reverse()) ordering.remove(index);
                    // Tolto tutto, il piede se ne va: il fuoco passa al titolo del foglio.
                    requestAnimationFrame(() => {
                        if (!document.activeElement || document.activeElement === document.body) {
                            document.getElementById(TITLE_ID)?.focus();
                        }
                    });
                }}
            >
                {label}
            </button>
        </div>
    );
}
