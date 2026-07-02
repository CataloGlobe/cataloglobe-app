import { useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2OrderWithItems, RectifyOrderItem } from "@/types/orders";
import styles from "./OrderRectifyForm.module.scss";

const MAX_REASON_LENGTH = 500;

export interface RectifyFormState {
    estimate: number;
    canConfirm: boolean;
}

interface Props {
    /** Collega il submit a un bottone esterno via attributo `form`. */
    formId: string;
    order: V2OrderWithItems;
    onSubmit: (items: RectifyOrderItem[], reason: string) => void | Promise<void>;
    /** Notifica al consumer estimate + canConfirm per footer (stimato + gating). */
    onStateChange?: (state: RectifyFormState) => void;
    disabled?: boolean;
}

interface RectifyItemState {
    included: boolean;
    quantity: number;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

/**
 * Form puro di rettifica (storno) di un ordine — nessuna logica drawer.
 * Selezione articoli + quantità (`max = qty servita`; il residuo cumulativo lo
 * valida la RPC) + motivo opzionale. Il submit button vive nel footer del
 * consumer, collegato via `form={formId}`. Riusato da `OrderRectifyDrawer`
 * (dormiente) e dalla vista interna "storna" del conto (`TableDetailDrawer`).
 */
export default function OrderRectifyForm({
    formId,
    order,
    onSubmit,
    onStateChange,
    disabled
}: Props) {
    const [itemStates, setItemStates] = useState<Record<string, RectifyItemState>>({});
    const [reason, setReason] = useState("");

    useEffect(() => {
        const init: Record<string, RectifyItemState> = {};
        for (const item of order.items ?? []) {
            init[item.id] = { included: false, quantity: 1 };
        }
        setItemStates(init);
        setReason("");
    }, [order]);

    function toggleItem(itemId: string) {
        setItemStates(prev => ({
            ...prev,
            [itemId]: {
                included: !prev[itemId]?.included,
                quantity: prev[itemId]?.quantity ?? 1
            }
        }));
    }

    function setItemQuantity(itemId: string, quantity: number, maxQty: number) {
        const clamped = Math.max(1, Math.min(quantity, maxQty));
        setItemStates(prev => ({
            ...prev,
            [itemId]: {
                included: prev[itemId]?.included ?? false,
                quantity: clamped
            }
        }));
    }

    const selectedItems = useMemo<RectifyOrderItem[]>(() => {
        const items: RectifyOrderItem[] = [];
        for (const item of order.items ?? []) {
            const state = itemStates[item.id];
            if (state?.included && state.quantity > 0) {
                items.push({ order_item_id: item.id, quantity: state.quantity });
            }
        }
        return items;
    }, [order, itemStates]);

    const estimate = useMemo(() => {
        let total = 0;
        for (const item of order.items ?? []) {
            const state = itemStates[item.id];
            if (state?.included) {
                total += item.unit_price_snapshot * state.quantity;
            }
        }
        return total;
    }, [order, itemStates]);

    const reasonOverflow = reason.length - MAX_REASON_LENGTH;
    const canConfirm = selectedItems.length > 0 && reasonOverflow <= 0 && !disabled;

    // Comunica estimate + canConfirm al footer del consumer. `onStateChange`
    // deve avere identità stabile (es. setState) per evitare loop.
    useEffect(() => {
        onStateChange?.({ estimate, canConfirm });
    }, [estimate, canConfirm, onStateChange]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!canConfirm) return;
        await onSubmit(selectedItems, reason.trim());
    }

    return (
        <form id={formId} onSubmit={handleSubmit} className={styles.content}>
            <InlineBanner variant="warning">
                Lo storno crea una rettifica contabile dell'ordine servito;
                l'originale resta invariato.
            </InlineBanner>

            <div className={styles.section}>
                <Text variant="body-sm" weight={600} colorVariant="muted">
                    Seleziona gli articoli da stornare
                </Text>
                <div className={styles.items}>
                    {(order.items ?? []).map(item => {
                        const state = itemStates[item.id] ?? {
                            included: false,
                            quantity: 1
                        };
                        return (
                            <div
                                key={item.id}
                                className={
                                    state.included ? styles.itemRowSelected : styles.itemRow
                                }
                            >
                                <label className={styles.itemCheckbox}>
                                    <input
                                        type="checkbox"
                                        checked={state.included}
                                        onChange={() => toggleItem(item.id)}
                                        disabled={disabled}
                                    />
                                    <div className={styles.itemInfo}>
                                        <Text weight={500}>
                                            <span className={styles.itemQty}>
                                                {item.quantity}x
                                            </span>{" "}
                                            {item.product_name_snapshot}
                                        </Text>
                                        {item.options_snapshot.primary_option && (
                                            <Text variant="body-sm" colorVariant="muted">
                                                {item.options_snapshot.primary_option.value_name}
                                            </Text>
                                        )}
                                        <Text variant="body-sm" colorVariant="muted">
                                            {formatEur(item.line_total)} totali
                                        </Text>
                                    </div>
                                </label>

                                <div className={styles.qtyControl}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Storno:
                                    </Text>
                                    <input
                                        type="number"
                                        min={1}
                                        max={item.quantity}
                                        step={1}
                                        value={state.quantity}
                                        disabled={!state.included || disabled}
                                        onChange={e =>
                                            setItemQuantity(
                                                item.id,
                                                Number(e.target.value),
                                                item.quantity
                                            )
                                        }
                                        className={styles.qtyInput}
                                    />
                                    <Text variant="body-sm" colorVariant="muted">
                                        di {item.quantity}
                                    </Text>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className={styles.field}>
                <label htmlFor={`${formId}-reason`}>
                    <Text variant="body-sm" weight={500}>
                        Motivo dello storno (opzionale)
                    </Text>
                </label>
                <textarea
                    id={`${formId}-reason`}
                    className={styles.textarea}
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="es. Errore di battitura, prodotto non disponibile, ripensamento cliente..."
                    rows={3}
                    maxLength={MAX_REASON_LENGTH + 50}
                    disabled={disabled}
                />
                <Text
                    variant="body-sm"
                    colorVariant={reasonOverflow > 0 ? "error" : "muted"}
                >
                    {reasonOverflow > 0
                        ? `${reasonOverflow} caratteri di troppo`
                        : `${MAX_REASON_LENGTH - reason.length} caratteri rimanenti`}
                </Text>
            </div>
        </form>
    );
}
