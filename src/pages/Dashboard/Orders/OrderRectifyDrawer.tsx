import { useEffect, useMemo, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2OrderWithItems, RectifyOrderItem } from "@/types/orders";
import styles from "./OrderRectifyDrawer.module.scss";

interface Props {
    open: boolean;
    order: V2OrderWithItems | null;
    tableLabel: string;
    tableZone: string | null;
    onClose: () => void;
    onConfirm: (items: RectifyOrderItem[], reason: string) => Promise<void>;
}

const MAX_REASON_LENGTH = 500;

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

export default function OrderRectifyDrawer({
    open,
    order,
    tableLabel,
    tableZone,
    onClose,
    onConfirm
}: Props) {
    const [itemStates, setItemStates] = useState<Record<string, RectifyItemState>>({});
    const [reason, setReason] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (open && order) {
            const init: Record<string, RectifyItemState> = {};
            for (const item of order.items ?? []) {
                init[item.id] = { included: false, quantity: 1 };
            }
            setItemStates(init);
            setReason("");
        }
    }, [open, order]);

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
        if (!order) return [];
        const items: RectifyOrderItem[] = [];
        for (const item of order.items ?? []) {
            const state = itemStates[item.id];
            if (state?.included && state.quantity > 0) {
                items.push({ order_item_id: item.id, quantity: state.quantity });
            }
        }
        return items;
    }, [order, itemStates]);

    const totalStorno = useMemo(() => {
        if (!order) return 0;
        let total = 0;
        for (const item of order.items ?? []) {
            const state = itemStates[item.id];
            if (state?.included) {
                total += item.unit_price_snapshot * state.quantity;
            }
        }
        return total;
    }, [order, itemStates]);

    const remaining = MAX_REASON_LENGTH - reason.length;
    const canSubmit = selectedItems.length > 0 && remaining >= 0 && !isProcessing;

    async function handleConfirm() {
        if (!canSubmit) return;
        setIsProcessing(true);
        try {
            await onConfirm(selectedItems, reason.trim());
        } finally {
            setIsProcessing(false);
        }
    }

    if (!order) {
        return (
            <SystemDrawer open={open} onClose={onClose} width={560}>
                <DrawerLayout
                    header={
                        <Text variant="title-sm" weight={600}>
                            Rettifica ordine
                        </Text>
                    }
                    footer={
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
                        </Button>
                    }
                >
                    <div className={styles.empty}>
                        <Text colorVariant="muted">Ordine non disponibile</Text>
                    </div>
                </DrawerLayout>
            </SystemDrawer>
        );
    }

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Rettifica ordine
                    </Text>
                }
                footer={
                    <>
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isProcessing}
                        >
                            Annulla
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleConfirm}
                            loading={isProcessing}
                            disabled={!canSubmit}
                        >
                            Conferma rettifica
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <div className={styles.headerInfo}>
                        <Text weight={600}>
                            {tableLabel}
                            {tableZone ? ` · ${tableZone}` : ""}
                        </Text>
                    </div>

                    <InlineBanner variant="info">
                        La rettifica crea un nuovo ordine "storno" associato a questo
                        ordine originale. Le quantità selezionate vengono stornate. Il
                        totale dell'ordine non cambia retroattivamente, ma il nuovo
                        ordine storno appare nello storico del cliente.
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
                                            state.included
                                                ? styles.itemRowSelected
                                                : styles.itemRow
                                        }
                                    >
                                        <label className={styles.itemCheckbox}>
                                            <input
                                                type="checkbox"
                                                checked={state.included}
                                                onChange={() => toggleItem(item.id)}
                                            />
                                            <div className={styles.itemInfo}>
                                                <Text weight={500}>
                                                    <span className={styles.itemQty}>
                                                        {item.quantity}x
                                                    </span>{" "}
                                                    {item.product_name_snapshot}
                                                </Text>
                                                {item.options_snapshot.primary_option && (
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="muted"
                                                    >
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
                                                disabled={!state.included}
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

                    {selectedItems.length > 0 && (
                        <div className={styles.totalRow}>
                            <Text weight={600}>Totale storno (approssimato)</Text>
                            <Text weight={600}>{formatEur(totalStorno)}</Text>
                        </div>
                    )}

                    <div className={styles.field}>
                        <label htmlFor="rectify-reason">
                            <Text variant="body-sm" weight={500}>
                                Motivo (opzionale)
                            </Text>
                        </label>
                        <textarea
                            id="rectify-reason"
                            className={styles.textarea}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="es. Errore di battitura, prodotto non disponibile, ripensamento cliente..."
                            rows={3}
                            maxLength={MAX_REASON_LENGTH + 50}
                            disabled={isProcessing}
                        />
                        <Text
                            variant="body-sm"
                            colorVariant={remaining < 0 ? "error" : "muted"}
                        >
                            {remaining < 0
                                ? `${Math.abs(remaining)} caratteri di troppo`
                                : `${remaining} caratteri rimanenti`}
                        </Text>
                    </div>
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
