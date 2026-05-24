import { useEffect, useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2OrderWithItems } from "@/types/orders";
import styles from "./OrderCancelDrawer.module.scss";

interface Props {
    open: boolean;
    order: V2OrderWithItems | null;
    tableLabel?: string;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
}

const MAX_REASON_LENGTH = 500;

export default function OrderCancelDrawer({
    open,
    order,
    tableLabel,
    onClose,
    onConfirm
}: Props) {
    const [reason, setReason] = useState("");
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (open) setReason("");
    }, [open]);

    async function handleConfirm() {
        setIsProcessing(true);
        try {
            await onConfirm(reason);
        } finally {
            setIsProcessing(false);
        }
    }

    const remaining = MAX_REASON_LENGTH - reason.length;
    const isOverLimit = remaining < 0;

    return (
        <SystemDrawer open={open} onClose={onClose} width={480}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Cancella ordine
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
                            variant="danger"
                            onClick={handleConfirm}
                            loading={isProcessing}
                            disabled={isOverLimit}
                        >
                            Cancella ordine
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <Text>
                        Stai per cancellare l'ordine
                        {tableLabel ? (
                            <>
                                {" "}del tavolo <strong>{tableLabel}</strong>
                            </>
                        ) : null}
                        . Questa azione è definitiva.
                    </Text>

                    <InlineBanner variant="warning">
                        Il cliente vedrà immediatamente che l'ordine è stato cancellato.
                        Se l'ordine era già consegnato, considera la rettifica invece della
                        cancellazione totale.
                    </InlineBanner>

                    <div className={styles.field}>
                        <label htmlFor="cancel-reason">
                            <Text variant="body-sm" weight={500}>
                                Motivo (opzionale)
                            </Text>
                        </label>
                        <textarea
                            id="cancel-reason"
                            className={styles.textarea}
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="es. Ingredienti finiti, errore staff, richiesta cliente..."
                            rows={4}
                            maxLength={MAX_REASON_LENGTH + 50}
                            disabled={isProcessing}
                        />
                        <Text
                            variant="body-sm"
                            colorVariant={isOverLimit ? "error" : "muted"}
                        >
                            {isOverLimit
                                ? `${Math.abs(remaining)} caratteri di troppo`
                                : `${remaining} caratteri rimanenti`}
                        </Text>
                    </div>

                    {order?.is_rectification && (
                        <Text variant="body-sm" colorVariant="muted">
                            Nota: stai cancellando una rettifica.
                        </Text>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
