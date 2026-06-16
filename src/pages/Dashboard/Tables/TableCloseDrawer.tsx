import { useState } from "react";
import { ConciergeBell, Receipt, UtensilsCrossed, Users } from "lucide-react";
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

function plural(n: number, sing: string, plur: string): string {
    return `${n} ${n === 1 ? sing : plur}`;
}

type ChipAccent = "warning" | "brand" | "neutral";

interface ChipProps {
    icon: React.ReactNode;
    label: string;
    accent?: ChipAccent;
}

function Chip({ icon, label, accent = "neutral" }: ChipProps) {
    return (
        <span className={`${styles.chip} ${styles[`chip-${accent}`]}`}>
            <span className={styles.chipIcon} aria-hidden>
                {icon}
            </span>
            <Text variant="body-sm" weight={500}>
                {label}
            </Text>
        </span>
    );
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
    const hasBillRequested = table.bill_requested_count > 0;
    const hasWaiterCalled = table.waiter_called_count > 0;
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
                                variant="outline-danger"
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
                        // Carve-out: tavolo "libero" — current_total qui puo'
                        // riflettere ordini consegnati storici (la view non
                        // resetta al close), quindi recap omesso per non
                        // mostrare un totale stale/fuorviante.
                        <InlineBanner variant="info">
                            Questo tavolo non ha conti aperti, ordini in corso ne'
                            sessioni cliente attive. Non c'e' niente da chiudere.
                        </InlineBanner>
                    ) : (
                        <>
                            <div className={styles.recap}>
                                {hasCurrentTotal && (
                                    <div className={styles.hero}>
                                        <Text variant="title-md" weight={700}>
                                            {formatEur(table.current_total)}
                                        </Text>
                                        <Text
                                            variant="body-sm"
                                            colorVariant="muted"
                                        >
                                            Totale al tavolo
                                        </Text>
                                    </div>
                                )}

                                <div className={styles.chips}>
                                    {hasOpenOrders && (
                                        <Chip
                                            icon={<UtensilsCrossed size={14} />}
                                            label={plural(
                                                table.open_orders_count,
                                                "ordine aperto",
                                                "ordini aperti"
                                            )}
                                            accent="warning"
                                        />
                                    )}
                                    {hasOpenGroups && (
                                        <Chip
                                            icon={<Receipt size={14} />}
                                            label={plural(
                                                table.open_groups_count,
                                                "conto aperto",
                                                "conti aperti"
                                            )}
                                        />
                                    )}
                                    {hasActiveSessions && (
                                        <Chip
                                            icon={<Users size={14} />}
                                            label={plural(
                                                table.active_sessions_count,
                                                "sessione attiva",
                                                "sessioni attive"
                                            )}
                                        />
                                    )}
                                    {hasBillRequested && (
                                        <Chip
                                            icon={<Receipt size={14} />}
                                            label={plural(
                                                table.bill_requested_count,
                                                "conto richiesto",
                                                "conti richiesti"
                                            )}
                                            accent="brand"
                                        />
                                    )}
                                    {hasWaiterCalled && (
                                        <Chip
                                            icon={<ConciergeBell size={14} />}
                                            label={plural(
                                                table.waiter_called_count,
                                                "cameriere chiamato",
                                                "camerieri chiamati"
                                            )}
                                            accent="brand"
                                        />
                                    )}
                                </div>

                                <div className={styles.divider} />

                                {hasOpenOrders ? (
                                    <InlineBanner variant="warning">
                                        {table.open_orders_count === 1
                                            ? "C'è 1 ordine ancora aperto (in cucina, pronto o in attesa). Scegli cosa farne prima di chiudere: segnalo come servito, oppure annullalo."
                                            : `Ci sono ${table.open_orders_count} ordini ancora aperti (in cucina, pronti o in attesa). Scegli cosa farne prima di chiudere: segnali tutti come serviti, oppure annullali tutti.`}
                                        {" "}
                                        La risoluzione, la chiusura dei conti e la
                                        terminazione delle sessioni cliente vengono
                                        applicate insieme, atomicamente.
                                    </InlineBanner>
                                ) : (
                                    <InlineBanner variant="info">
                                        Tutti i conti aperti verranno chiusi. Le
                                        sessioni cliente attive vengono terminate
                                        (expire immediato): alla prossima scansione
                                        del QR il cliente parte da una sessione
                                        nuova, senza vecchi ordini chiusi al
                                        seguito.
                                    </InlineBanner>
                                )}
                            </div>

                            <div className={styles.spacer} aria-hidden />
                        </>
                    )}
                </div>
            </DrawerLayout>
        </SystemDrawer>
    );
}
