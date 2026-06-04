import { useState } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import type { V2TableWithState, CloseTableOpenOrdersAction } from "@/types/orders";
import styles from "./TableCloseDrawer.module.scss";

interface Props {
    open: boolean;
    table: V2TableWithState | null;
    onClose: () => void;
    /**
     * `action`:
     *   - 'none' chiusura semplice (nessun aperto).
     *   - 'deliver' bulk-resolve a delivered.
     *   - 'cancel'  bulk-resolve a cancelled.
     */
    onConfirm: (action: "none" | CloseTableOpenOrdersAction) => Promise<void>;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

export default function TableCloseDrawer({ open, table, onClose, onConfirm }: Props) {
    const [processingAction, setProcessingAction] = useState<
        "none" | CloseTableOpenOrdersAction | null
    >(null);
    const isProcessing = processingAction !== null;

    async function handleConfirm(action: "none" | CloseTableOpenOrdersAction) {
        setProcessingAction(action);
        try {
            await onConfirm(action);
        } finally {
            setProcessingAction(null);
        }
    }

    if (!table) return null;

    const hasOpenGroups = table.open_groups_count > 0;
    const hasOpenOrders = table.open_orders_count > 0;
    const hasActiveSessions = table.active_sessions_count > 0;
    const hasCurrentTotal = table.current_total > 0;
    // Un tavolo occupato solo per sessione (0 conti, 0 ordini, 1+ sessioni)
    // deve poter essere chiuso: la chiusura terminera' le sessioni
    // attive (expire_at = now()) e il tavolo torna Libero.
    const nothingToClose = !hasOpenGroups && !hasOpenOrders && !hasActiveSessions;

    return (
        <SystemDrawer open={open} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        Chiudi tavolo
                    </Text>
                }
                footer={
                    nothingToClose ? (
                        <Button
                            variant="secondary"
                            onClick={onClose}
                            disabled={isProcessing}
                        >
                            Chiudi
                        </Button>
                    ) : hasOpenOrders ? (
                        // Aperti > 0 → stack verticale full-width nel footer
                        // slot di DrawerLayout. Gerarchia top→bottom:
                        // primary (azione consigliata), danger, ghost (cancel
                        // drawer). Le label lunghe non si stringono.
                        <div className={styles.actionsStack}>
                            <Button
                                variant="primary"
                                fullWidth
                                onClick={() => void handleConfirm("deliver")}
                                loading={processingAction === "deliver"}
                                disabled={
                                    isProcessing && processingAction !== "deliver"
                                }
                            >
                                Segna tutte come servite e chiudi
                            </Button>
                            <Button
                                variant="danger"
                                fullWidth
                                onClick={() => void handleConfirm("cancel")}
                                loading={processingAction === "cancel"}
                                disabled={
                                    isProcessing && processingAction !== "cancel"
                                }
                            >
                                Annulla tutte e chiudi
                            </Button>
                            <Button
                                variant="ghost"
                                fullWidth
                                onClick={onClose}
                                disabled={isProcessing}
                            >
                                Annulla
                            </Button>
                        </div>
                    ) : (
                        // Nessun aperto, solo conti da chiudere → chiusura semplice.
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
                                onClick={() => void handleConfirm("none")}
                                loading={processingAction === "none"}
                            >
                                Chiudi tavolo
                            </Button>
                        </>
                    )
                }
            >
                <div className={styles.content}>
                    <Text>
                        Stai per chiudere il tavolo <strong>{table.label}</strong>
                        {table.zone_name && <span> ({table.zone_name})</span>}.
                    </Text>

                    {nothingToClose ? (
                        <InlineBanner variant="info">
                            Questo tavolo non ha conti aperti, ordini in corso ne'
                            sessioni cliente attive. Non c'e' niente da chiudere.
                        </InlineBanner>
                    ) : (
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
                                {hasOpenOrders && (
                                    <div className={styles.statRow}>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Ordini aperti (non ancora terminali):
                                        </Text>
                                        <Text weight={500} colorVariant="warning">
                                            {table.open_orders_count}
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

                            {hasOpenOrders ? (
                                <InlineBanner variant="warning">
                                    Ci sono {table.open_orders_count} ordini ancora
                                    aperti (in cucina, pronti o in attesa). Scegli
                                    cosa farne prima di chiudere: segnali tutti come
                                    serviti, oppure annullali tutti. La risoluzione,
                                    la chiusura dei conti e la terminazione delle
                                    sessioni cliente vengono applicate insieme,
                                    atomicamente.
                                </InlineBanner>
                            ) : (
                                <InlineBanner variant="info">
                                    Tutti i conti aperti verranno chiusi. Le sessioni
                                    cliente attive vengono terminate (expire
                                    immediato): alla prossima scansione del QR il
                                    cliente parte da una sessione nuova, senza
                                    vecchi ordini chiusi al seguito.
                                </InlineBanner>
                            )}
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
