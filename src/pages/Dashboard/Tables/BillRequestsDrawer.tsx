import { useEffect, useState, useCallback } from "react";
import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import {
    listBillRequestsForTable,
    clearBillRequest,
    type BillRequestRow
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

    const [requests, setRequests] = useState<BillRequestRow[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadRequests = useCallback(async () => {
        if (!tableId || !tenantId) return;
        setIsLoading(true);
        try {
            const data = await listBillRequestsForTable(tableId, tenantId);
            setRequests(data);
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

    const handleClear = useCallback(
        async (sessionId: string) => {
            if (!tenantId) return;
            setProcessingId(sessionId);
            try {
                await clearBillRequest(sessionId, tenantId);
                showToast({ message: "Conto gestito", type: "success" });
                const remaining = requests.length - 1;
                await loadRequests();
                onSuccess?.();
                if (remaining <= 0) {
                    onClose();
                }
            } catch {
                showToast({ message: "Errore durante l'operazione", type: "error" });
            } finally {
                setProcessingId(null);
            }
        },
        [tenantId, requests.length, loadRequests, showToast, onSuccess, onClose]
    );

    return (
        <SystemDrawer open={isOpen} onClose={onClose} width={420}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={700}>
                        Richieste conto · Tavolo {tableLabel}
                    </Text>
                }
            >
                {isLoading && (
                    <Text variant="body-sm" colorVariant="muted">
                        Caricamento...
                    </Text>
                )}

                {!isLoading && requests.length === 0 && (
                    <Text variant="body-sm" colorVariant="muted">
                        Nessuna richiesta attiva.
                    </Text>
                )}

                {!isLoading && requests.length > 0 && (
                    <div className={styles.list}>
                        {requests.map(req => (
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
                                    onClick={() => handleClear(req.id)}
                                    loading={processingId === req.id}
                                >
                                    Risposto
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </DrawerLayout>
        </SystemDrawer>
    );
}
