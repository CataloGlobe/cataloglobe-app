import { useEffect, useMemo, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderCancelItemDrawer.module.scss";

interface Props {
    open: boolean;
    order: V2OrderWithItems | null;
    tableLabel: string;
    tableZone: string | null;
    onClose: () => void;
    onConfirm: (itemIds: string[], reason: string) => Promise<void>;
}

const MAX_REASON_LENGTH = 500;

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

export default function OrderCancelItemDrawer({
    open,
    order,
    tableLabel,
    tableZone,
    onClose,
    onConfirm
}: Props) {
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [reason, setReason] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    // Solo gli articoli ancora attivi sono annullabili (gli altri sono già
    // stati annullati pre-servizio in una sessione precedente del drawer).
    const activeItems = useMemo(
        () => (order?.items ?? []).filter(item => item.cancelled_at == null),
        [order]
    );

    useEffect(() => {
        if (open && order) {
            setSelected({});
            setReason("");
        }
    }, [open, order]);

    function toggleItem(itemId: string) {
        setSelected(prev => ({ ...prev, [itemId]: !prev[itemId] }));
    }

    const selectedIds = useMemo(
        () => activeItems.filter(item => selected[item.id]).map(item => item.id),
        [activeItems, selected]
    );

    const totalRemoved = useMemo(
        () =>
            activeItems
                .filter(item => selected[item.id])
                .reduce((sum, item) => sum + item.line_total, 0),
        [activeItems, selected]
    );

    const remaining = MAX_REASON_LENGTH - reason.length;
    const canSubmit = selectedIds.length > 0 && remaining >= 0 && !isProcessing;

    async function handleConfirm() {
        if (!canSubmit) return;
        setIsProcessing(true);
        try {
            await onConfirm(selectedIds, reason.trim());
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
                            Annulla articolo
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
                        Annulla articolo
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
                            Conferma annullo
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

                    <InlineBanner variant="warning">
                        Nessuno storno: l'ordine non è ancora servito. Gli articoli
                        selezionati vengono rimossi dalla comanda e dal conto.
                    </InlineBanner>

                    <div className={styles.section}>
                        <Text variant="body-sm" weight={600} colorVariant="muted">
                            Seleziona gli articoli da annullare
                        </Text>
                        {activeItems.length === 0 ? (
                            <Text colorVariant="muted">
                                Nessun articolo annullabile.
                            </Text>
                        ) : (
                            <div className={styles.items}>
                                {activeItems.map(item => {
                                    const isSelected = !!selected[item.id];
                                    return (
                                        <label
                                            key={item.id}
                                            className={
                                                isSelected
                                                    ? styles.itemRowSelected
                                                    : styles.itemRow
                                            }
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
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
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {selectedIds.length > 0 && (
                        <div className={styles.totalRow}>
                            <Text weight={600}>Totale rimosso</Text>
                            <Text weight={600}>−{formatEur(totalRemoved)}</Text>
                        </div>
                    )}

                    <div className={styles.field}>
                        <label htmlFor="cancel-item-reason">
                            <Text variant="body-sm" weight={500}>
                                Motivo (opzionale)
                            </Text>
                        </label>
                        <textarea
                            id="cancel-item-reason"
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
