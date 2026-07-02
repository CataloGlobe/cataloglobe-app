import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import OrderRectifyForm, { type RectifyFormState } from "./OrderRectifyForm";
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

const FORM_ID = "rectify-form";

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

/**
 * Drawer di rettifica (storno) standalone. La logica del form è estratta in
 * `OrderRectifyForm` (riusato anche dalla vista interna del conto). Qui resta
 * solo la shell drawer + footer con submit collegato via `form={FORM_ID}`.
 */
export default function OrderRectifyDrawer({
    open,
    order,
    tableLabel,
    tableZone,
    onClose,
    onConfirm
}: Props) {
    const [formState, setFormState] = useState<RectifyFormState>({
        estimate: 0,
        canConfirm: false
    });
    const [isProcessing, setIsProcessing] = useState(false);

    async function handleSubmit(items: RectifyOrderItem[], reason: string) {
        setIsProcessing(true);
        try {
            await onConfirm(items, reason);
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
                        {formState.estimate > 0 && (
                            <Text weight={600} className={styles.footerEstimate}>
                                Storno stimato −{formatEur(formState.estimate)}
                            </Text>
                        )}
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isProcessing}
                        >
                            Annulla
                        </Button>
                        <Button
                            type="submit"
                            form={FORM_ID}
                            variant="primary"
                            loading={isProcessing}
                            disabled={!formState.canConfirm || isProcessing}
                        >
                            Conferma rettifica
                        </Button>
                    </>
                }
            >
                <div className={styles.headerInfo}>
                    <Text weight={600}>
                        {tableLabel}
                        {tableZone ? ` · ${tableZone}` : ""}
                    </Text>
                </div>
                <OrderRectifyForm
                    formId={FORM_ID}
                    order={order}
                    onSubmit={handleSubmit}
                    onStateChange={setFormState}
                    disabled={isProcessing}
                />
            </DrawerLayout>
        </SystemDrawer>
    );
}
