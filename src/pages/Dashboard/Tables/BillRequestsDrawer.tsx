import { useEffect, useState, useCallback } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import {
    listBillRequestsForTable,
    clearBillRequest,
    listWaiterCallsForTable,
    clearWaiterCall,
    type BillRequestRow,
    type WaiterCallRow
} from "@/services/supabase/tables";
import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import styles from "./BillRequestsDrawer.module.scss";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tableId: string | null;
    tableLabel: string;
    onSuccess?: () => void;
}

export default function BillRequestsDrawer({
    isOpen,
    onClose,
    tableId,
    tableLabel,
    onSuccess
}: Props) {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    const [billRequests, setBillRequests] = useState<BillRequestRow[]>([]);
    const [waiterCalls, setWaiterCalls] = useState<WaiterCallRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingBillId, setProcessingBillId] = useState<string | null>(null);
    const [processingWaiterId, setProcessingWaiterId] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        if (!tableId || !tenantId) return;
        setIsLoading(true);
        try {
            const [bills, waiters] = await Promise.all([
                listBillRequestsForTable(tableId, tenantId),
                listWaiterCallsForTable(tableId, tenantId)
            ]);
            setBillRequests(bills);
            setWaiterCalls(waiters);
        } catch {
            showToast({ message: "Errore nel caricamento richieste", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tableId, tenantId, showToast]);

    useEffect(() => {
        if (isOpen && tableId) {
            void loadRequests();
        }
    }, [isOpen, tableId, loadRequests]);

    const handleClearBill = useCallback(
        async (sessionId: string) => {
            if (!tenantId) return;
            setProcessingBillId(sessionId);
            try {
                await clearBillRequest(sessionId, tenantId);
                showToast({ message: "Conto gestito", type: "success" });
                const remainingBill = billRequests.length - 1;
                await loadRequests();
                onSuccess?.();
                if (remainingBill <= 0 && waiterCalls.length === 0) {
                    onClose();
                }
            } catch {
                showToast({ message: "Errore durante l'operazione", type: "error" });
            } finally {
                setProcessingBillId(null);
            }
        },
        [tenantId, billRequests.length, waiterCalls.length, loadRequests, showToast, onSuccess, onClose]
    );

    const handleClearWaiter = useCallback(
        async (sessionId: string) => {
            if (!tenantId) return;
            setProcessingWaiterId(sessionId);
            try {
                await clearWaiterCall(sessionId, tenantId);
                showToast({ message: "Cameriere gestito", type: "success" });
                const remainingWaiter = waiterCalls.length - 1;
                await loadRequests();
                onSuccess?.();
                if (billRequests.length === 0 && remainingWaiter <= 0) {
                    onClose();
                }
            } catch {
                showToast({ message: "Errore durante l'operazione", type: "error" });
            } finally {
                setProcessingWaiterId(null);
            }
        },
        [tenantId, waiterCalls.length, billRequests.length, loadRequests, showToast, onSuccess, onClose]
    );

    const isEmpty = !isLoading && billRequests.length === 0 && waiterCalls.length === 0;

    return (
        <SystemDrawer open={isOpen} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Richieste · Tavolo {tableLabel}
                    </Text>
                }
            >
                {isLoading && (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                )}

                {isEmpty && (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna richiesta attiva.
                    </Text>
                )}

                {!isLoading && billRequests.length > 0 && (
                    <div className={styles.section}>
                        <Text variant="body-sm" weight={600} colorVariant="muted">
                            Richieste conto
                        </Text>
                        <div className={styles.list}>
                            {billRequests.map(req => (
                                <div key={req.id} className={styles.requestCard}>
                                    <div className={styles.requestInfo}>
                                        <Text variant="body-sm" weight={600}>
                                            {req.customer_name || "Cliente"}
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Richiesto:{" "}
                                            {new Date(req.bill_requested_at).toLocaleTimeString("it-IT", {
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </Text>
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleClearBill(req.id)}
                                        loading={processingBillId === req.id}
                                    >
                                        Risposto
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!isLoading && waiterCalls.length > 0 && (
                    <div className={styles.section}>
                        <Text variant="body-sm" weight={600} colorVariant="muted">
                            Chiamate cameriere
                        </Text>
                        <div className={styles.list}>
                            {waiterCalls.map(req => (
                                <div key={req.id} className={styles.requestCard}>
                                    <div className={styles.requestInfo}>
                                        <Text variant="body-sm" weight={600}>
                                            {req.customer_name || "Cliente"}
                                        </Text>
                                        <Text variant="body-sm" colorVariant="muted">
                                            Chiamato:{" "}
                                            {new Date(req.waiter_called_at).toLocaleTimeString("it-IT", {
                                                hour: "2-digit",
                                                minute: "2-digit"
                                            })}
                                        </Text>
                                    </div>
                                    <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() => handleClearWaiter(req.id)}
                                        loading={processingWaiterId === req.id}
                                    >
                                        Arrivato
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
