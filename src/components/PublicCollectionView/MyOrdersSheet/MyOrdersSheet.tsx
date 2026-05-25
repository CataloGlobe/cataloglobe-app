import { useState, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import PublicSheet from "../PublicSheet/PublicSheet";
import { getOrdersForSession, cancelOrderCustomer } from "@/services/supabase/orders";
import { useCustomerSession } from "@/context/CustomerSession/CustomerSessionContext";
import type { SessionOrderSummary, OrderStatus } from "@/types/orders";
import styles from "./MyOrdersSheet.module.scss";

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

function formatPrice(n: number): string {
    return new Intl.NumberFormat("it-IT", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 2
    }).format(n);
}

function formatRelativeMinimal(iso: string): string {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Ora";
    if (diffMin < 60) return `${diffMin} min fa`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} h fa`;
    return new Intl.DateTimeFormat("it-IT", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    }).format(new Date(iso));
}

function statusInfo(status: OrderStatus): { label: string; className: string } {
    switch (status) {
        case "submitted":    return { label: "In attesa di conferma",  className: "statusSubmitted" };
        case "acknowledged": return { label: "Confermato dallo staff", className: "statusAcknowledged" };
        case "delivered":    return { label: "Consegnato",             className: "statusDelivered" };
        case "cancelled":    return { label: "Cancellato",             className: "statusCancelled" };
        default:             return { label: status,                   className: "statusSubmitted" };
    }
}

export default function MyOrdersSheet({ isOpen, onClose }: Props) {
    const { session, clear } = useCustomerSession();

    const [orders, setOrders] = useState<SessionOrderSummary[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
    const [processingCancelId, setProcessingCancelId] = useState<string | null>(null);

    const loadOrders = useCallback(async () => {
        if (!session) {
            setOrders([]);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const result = await getOrdersForSession(session.jwt);
            setOrders(result.orders);
        } catch (err) {
            if (err instanceof Error) {
                if (err.message.toLowerCase().includes("scaduta")) {
                    clear();
                    setError("La sessione è scaduta. Scansiona di nuovo il QR.");
                    return;
                }
                setError(err.message);
                return;
            }
            setError("Errore nel caricamento degli ordini.");
        } finally {
            setIsLoading(false);
        }
    }, [session, clear]);

    useEffect(() => {
        if (isOpen) {
            void loadOrders();
            setConfirmingCancelId(null);
        }
    }, [isOpen, loadOrders]);

    async function handleCancelConfirm(orderId: string) {
        if (!session) return;
        setProcessingCancelId(orderId);
        try {
            await cancelOrderCustomer(session.jwt, orderId);
            setConfirmingCancelId(null);
            await loadOrders();
        } catch (err) {
            if (err instanceof Error) {
                const msg = err.message;
                if (msg.toLowerCase().includes("scaduta")) {
                    clear();
                    setError("La sessione è scaduta. Scansiona di nuovo il QR.");
                    return;
                }
                if (msg === "INVALID_STATE_TRANSITION") {
                    setError("L'ordine non può più essere annullato (già preso in carico dallo staff).");
                    void loadOrders();
                    setConfirmingCancelId(null);
                    return;
                }
                setError(msg);
                return;
            }
            setError("Errore durante l'annullamento.");
        } finally {
            setProcessingCancelId(null);
        }
    }

    return (
        <PublicSheet isOpen={isOpen} onClose={onClose} ariaLabel="I miei ordini">
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2 className={styles.title}>I miei ordini</h2>
                    <button
                        type="button"
                        className={styles.refreshBtn}
                        onClick={() => void loadOrders()}
                        disabled={isLoading}
                        aria-label="Aggiorna"
                    >
                        <RefreshCw size={18} className={isLoading ? styles.spinning : ""} />
                    </button>
                </div>

                <div className={styles.scrollArea}>
                {error && (
                    <div className={styles.errorBanner}>{error}</div>
                )}

                {isLoading && orders.length === 0 ? (
                    <div className={styles.loading}>
                        <Loader2 className={styles.spinning} size={32} />
                        <p>Caricamento ordini...</p>
                    </div>
                ) : orders.length === 0 ? (
                    <div className={styles.empty}>
                        <p>Non hai ancora ordini.</p>
                        <p className={styles.emptyHint}>I tuoi ordini appariranno qui dopo l'invio.</p>
                    </div>
                ) : (
                    <div className={styles.list}>
                        {orders.map((order) => {
                            const st = statusInfo(order.status);
                            const isConfirming = confirmingCancelId === order.id;
                            const isProcessing = processingCancelId === order.id;
                            const canCancel = order.status === "submitted";

                            return (
                                <div key={order.id} className={styles.orderCard} data-status={order.status}>
                                    <div className={styles.orderHeader}>
                                        <span className={`${styles.statusPill} ${styles[st.className]}`}>
                                            {st.label}
                                        </span>
                                        <span className={styles.orderTime}>{formatRelativeMinimal(order.created_at)}</span>
                                    </div>

                                    <ul className={styles.itemsList}>
                                        {(order.items ?? []).map((item) => (
                                            <li key={item.id} className={styles.itemRow}>
                                                <span className={styles.itemQty}>{item.quantity}x</span>
                                                <span className={styles.itemName}>{item.product_name_snapshot}</span>
                                                <span className={styles.itemPrice}>{formatPrice(item.line_total)}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <div className={styles.orderTotalRow}>
                                        <span>Totale</span>
                                        <span>{formatPrice(order.total_amount)}</span>
                                    </div>

                                    {canCancel && !isConfirming && (
                                        <button
                                            type="button"
                                            className={styles.cancelBtn}
                                            onClick={() => setConfirmingCancelId(order.id)}
                                            disabled={isProcessing}
                                        >
                                            <X size={16} />
                                            Annulla ordine
                                        </button>
                                    )}

                                    {canCancel && isConfirming && (
                                        <div className={styles.confirmRow}>
                                            <span className={styles.confirmLabel}>Vuoi davvero annullare?</span>
                                            <div className={styles.confirmActions}>
                                                <button
                                                    type="button"
                                                    className={styles.confirmCancel}
                                                    onClick={() => setConfirmingCancelId(null)}
                                                    disabled={isProcessing}
                                                >
                                                    No
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.confirmYes}
                                                    onClick={() => handleCancelConfirm(order.id)}
                                                    disabled={isProcessing}
                                                >
                                                    {isProcessing ? "Annullamento..." : "Sì, annulla"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                </div>
            </div>
        </PublicSheet>
    );
}
