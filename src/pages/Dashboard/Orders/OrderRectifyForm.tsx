import { useEffect, useMemo, useState } from "react";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type {
    V2OrderWithItems,
    V2OrderItem,
    RectifyOrderItem,
    V2RectifiableResidual
} from "@/types/orders";
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
    /**
     * Residui stornabili per riga (dalla RPC `get_rectifiable_residual`), forniti
     * dal consumer che ha già l'ordine in mano. Quando presenti: lo stepper mostra
     * `di <residuo>` con `max = residualQty`, e le righe già stornate del tutto
     * (`residualQty === 0`) restano visibili ma disabilitate. Quando `undefined`
     * o `null` (es. `OrderRectifyDrawer` dormiente, o fetch residui fallito) il form
     * ripiega sul comportamento legacy `max = qty servita`; la RPC resta la difesa
     * finale sul cap cumulativo reale.
     */
    residuals?: V2RectifiableResidual[] | null;
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
    disabled,
    residuals
}: Props) {
    const [itemStates, setItemStates] = useState<Record<string, RectifyItemState>>({});
    const [reason, setReason] = useState("");

    // Mappa orderItemId → residuo. `null`/`undefined` = modalità fallback
    // (nessun residuo noto → tetto = qty servita, la RPC valida il cap reale).
    const residualByItem = useMemo(() => {
        const m = new Map<string, V2RectifiableResidual>();
        if (residuals) for (const r of residuals) m.set(r.orderItemId, r);
        return m;
    }, [residuals]);

    // Tetto stornabile per riga: residuo se noto, altrimenti qty servita.
    function capForItem(item: V2OrderItem): number {
        const residual = residualByItem.get(item.id);
        return residual ? residual.residualQty : item.quantity;
    }

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
            const cap = capForItem(item);
            const state = itemStates[item.id];
            if (state?.included && state.quantity > 0 && cap > 0) {
                const qty = Math.min(state.quantity, cap);
                items.push({ order_item_id: item.id, quantity: qty });
            }
        }
        return items;
        // capForItem dipende da residualByItem → incluso nelle deps.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order, itemStates, residualByItem]);

    const estimate = useMemo(() => {
        let total = 0;
        for (const item of order.items ?? []) {
            const cap = capForItem(item);
            const state = itemStates[item.id];
            if (state?.included && cap > 0) {
                total += item.unit_price_snapshot * Math.min(state.quantity, cap);
            }
        }
        return total;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [order, itemStates, residualByItem]);

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
                        const residual = residualByItem.get(item.id);
                        // Tetto = residuo se noto, altrimenti qty servita (fallback).
                        const cap = residual ? residual.residualQty : item.quantity;
                        const fullyStorned = !!residual && residual.residualQty === 0;
                        // Contesto solo se stornato in parte (residuo + già-stornato > 0).
                        const partiallyStorned =
                            !!residual &&
                            residual.rectifiedQty > 0 &&
                            residual.residualQty > 0;
                        const rowClass = fullyStorned
                            ? styles.itemRowDisabled
                            : state.included
                              ? styles.itemRowSelected
                              : styles.itemRow;
                        return (
                            <div key={item.id} className={rowClass}>
                                <label className={styles.itemCheckbox}>
                                    <input
                                        type="checkbox"
                                        checked={state.included && !fullyStorned}
                                        onChange={() => toggleItem(item.id)}
                                        disabled={disabled || fullyStorned}
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
                                        {partiallyStorned && (
                                            <Text variant="body-sm" colorVariant="muted">
                                                {residual.residualQty} di{" "}
                                                {residual.originalQty} ·{" "}
                                                {residual.rectifiedQty} già stornato
                                            </Text>
                                        )}
                                        <Text variant="body-sm" colorVariant="muted">
                                            {formatEur(item.line_total)} totali
                                        </Text>
                                    </div>
                                </label>

                                {fullyStorned ? (
                                    <span className={styles.stornedBadge}>
                                        Già stornato
                                    </span>
                                ) : (
                                    <div className={styles.qtyControl}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Storno:
                                        </Text>
                                        <input
                                            type="number"
                                            min={1}
                                            max={cap}
                                            step={1}
                                            value={state.quantity}
                                            disabled={!state.included || disabled}
                                            onChange={e =>
                                                setItemQuantity(
                                                    item.id,
                                                    Number(e.target.value),
                                                    cap
                                                )
                                            }
                                            className={styles.qtyInput}
                                        />
                                        <Text variant="body-sm" colorVariant="muted">
                                            di {cap}
                                        </Text>
                                    </div>
                                )}
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
