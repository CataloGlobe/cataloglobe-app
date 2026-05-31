import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2TableWithState } from "@/types/orders";
import styles from "./TableCloseDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2TableWithState | null;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

export default function TableCloseDrawer({ open, table, onClose, onConfirm }: Props) {
    const [isProcessing, setIsProcessing] = useState(false);

    async function handleConfirm() {
        setIsProcessing(true);
        try {
            await onConfirm();
        } finally {
            setIsProcessing(false);
        }
    }

    if (!table) return null;

    const hasOpenGroups = table.open_groups_count > 0;
    const hasCurrentTotal = table.current_total > 0;

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Chiudi tavolo
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
                            disabled={!hasOpenGroups}
                        >
                            Chiudi tavolo
                        </Button>
                    </>
                }
            >
                <div className={styles.content}>
                    <Text>
                        Stai per chiudere il tavolo <strong>{table.label}</strong>
                        {table.zone_name && <span> ({table.zone_name})</span>}.
                    </Text>

                    {hasOpenGroups ? (
                        <>
                            <div className={styles.stats}>
                                <div className={styles.statRow}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Sessioni attive:
                                    </Text>
                                    <Text weight={500}>
                                        {table.active_sessions_count}
                                    </Text>
                                </div>
                                <div className={styles.statRow}>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Conti aperti:
                                    </Text>
                                    <Text weight={500}>{table.open_groups_count}</Text>
                                </div>
                                {table.pending_orders_count > 0 && (
                                    <div className={styles.statRow}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Ordini in cucina o da consegnare:
                                        </Text>
                                        <Text weight={500} colorVariant="warning">
                                            {table.pending_orders_count}
                                        </Text>
                                    </div>
                                )}
                                {hasCurrentTotal && (
                                    <div className={styles.statRow}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Totale corrente:
                                        </Text>
                                        <Text weight={600}>
                                            {formatEur(table.current_total)}
                                        </Text>
                                    </div>
                                )}
                            </div>

                            <InlineBanner variant="info">
                                Tutti i conti aperti verranno chiusi. Le sessioni
                                clienti attive vengono terminate naturalmente: alla
                                prossima scansione del QR partirà una nuova sessione.
                                Eventuali ordini ancora non consegnati (in cucina o
                                da portare al tavolo) bloccano la chiusura — completa
                                o cancella quegli ordini prima.
                            </InlineBanner>
                        </>
                    ) : (
                        <InlineBanner variant="info">
                            Questo tavolo non ha conti aperti. Non c'è niente da chiudere.
                        </InlineBanner>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
