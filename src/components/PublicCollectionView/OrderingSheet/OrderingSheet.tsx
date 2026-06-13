import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2, RefreshCw, X, AlertCircle } from "lucide-react";
import type { OrderingStateReason } from "@/types/orders";
import PublicSheet from "../PublicSheet/PublicSheet";
import OrderStatusStepper from "./OrderStatusStepper";
import ItemNoteEditor from "./ItemNoteEditor";
import OrderNoteEditor from "./OrderNoteEditor";
import { getOrdersForSession, cancelOrderCustomer, subscribeToSessionOrders } from "@/services/supabase/orders";
import { requestBill } from "@/services/supabase/customerSessions";
import { useCustomerSession } from "@/context/CustomerSession/CustomerSessionContext";
import type { SessionOrderSummary } from "@/types/orders";
import type { RealtimeChannel } from "@supabase/supabase-js";
import styles from "./OrderingSheet.module.scss";

// ─── Types — owned here, riusati da CollectionView + ItemDetail ──────────────

export type SelectedFormat = {
    id: string;
    name: string;
    price: number;
};

export type SelectedAddon = {
    id: string;
    groupId: string;
    name: string;
    priceDelta: number;
};

export type SelectionItem = {
    id: string;
    name: string;
    basePrice: number;
    qty: number;
    selectedFormat?: SelectedFormat | null;
    selectedAddons?: SelectedAddon[];
    /** basePrice + sum(addon.priceDelta) — effective unit price */
    unitPrice: number;
    /** Free-text item note (max 140 chars, applied client/Edge/DB). `null` = no note. */
    note: string | null;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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
    if (diffMin < 1) return "ora";
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

// ─── Component ──────────────────────────────────────────────────────────────

interface OrderingSheetProps {
    isOpen: boolean;
    onClose: () => void;
    activeTab: "cart" | "orders";
    onTabChange: (tab: "cart" | "orders") => void;

    items: SelectionItem[];
    onUpdateQty: (index: number, qty: number) => void;
    onRemove: (index: number) => void;
    onClear: () => void;
    onEditItem?: (index: number, item: SelectionItem) => void;
    /** Save trimmed item note (cart line `index`). */
    onItemNoteSave?: (index: number, note: string) => void;
    /** Remove item note (cart line `index`). */
    onItemNoteRemove?: (index: number) => void;

    /** Current order-level note (max 300). `null` = no note saved. */
    orderNote?: string | null;
    onOrderNoteSave?: (note: string) => void;
    onOrderNoteRemove?: () => void;

    orderingActive?: boolean;
    onSubmitOrder?: () => void;
    isSubmitting?: boolean;

    /**
     * Quando definito: maintenance attivo. Render banner inline sopra la
     * footer-CTA e disabilita "Invia ordine" (sostituito da "Ordinazioni
     * sospese"). Sorgente: prop esterna (URL param) oppure scoperta runtime
     * via 423 ORDERING_UNAVAILABLE sul submit precedente.
     */
    maintenance?: { reason: OrderingStateReason; message: string } | null;

    /**
     * Bill state — controllato dal parent (CollectionView) che mantiene la
     * subscription customer_sessions always-on. Sincronizzato via prop.
     */
    billRequestedAt: string | null;
    onBillRequestedAtChange: (next: string | null) => void;

    onSessionExpired?: () => void;
    ordersRefreshKey?: number;
}


export default function OrderingSheet({
    isOpen,
    onClose,
    activeTab,
    onTabChange,
    items,
    onUpdateQty,
    onRemove,
    onClear,
    onEditItem,
    onItemNoteSave,
    onItemNoteRemove,
    orderNote = null,
    onOrderNoteSave,
    onOrderNoteRemove,
    orderingActive = false,
    onSubmitOrder,
    isSubmitting = false,
    maintenance = null,
    billRequestedAt,
    onBillRequestedAtChange,
    onSessionExpired,
    ordersRefreshKey
}: OrderingSheetProps) {
    const { t } = useTranslation("public");
    const { session, clear } = useCustomerSession();

    const [orders, setOrders] = useState<SessionOrderSummary[]>([]);
    const [isLoadingOrders, setIsLoadingOrders] = useState(false);
    const [ordersError, setOrdersError] = useState<string | null>(null);
    const [confirmingCancelId, setConfirmingCancelId] = useState<string | null>(null);
    const [processingCancelId, setProcessingCancelId] = useState<string | null>(null);

    // Bill request state — `billRequestedAt` controllato dal parent.
    const [isRequestingBill, setIsRequestingBill] = useState(false);
    const [billError, setBillError] = useState<string | null>(null);

    const cartCount = items.reduce((sum, it) => sum + it.qty, 0);
    const cartTotal = items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
    const activeOrdersCount = orders.filter(o => o.status !== "cancelled").length;
    const isEmptyCart = items.length === 0;

    // Totale tavolo (per-session): somma orders acknowledged + ready + delivered,
    // esclude cancelled e submitted (submitted = ordine appena inviato non ancora
    // confermato, mostrato in Riepilogo conto solo dopo acknowledge). Lo stato
    // 'ready' indica che la cucina ha terminato la preparazione ma la consegna
    // al tavolo non e' ancora avvenuta — il cliente vede comunque l'importo
    // perche' l'impegno commerciale e' gia' confermato.
    const tableTotal = useMemo(() => {
        return orders
            .filter(
                o =>
                    o.status === "acknowledged" ||
                    o.status === "ready" ||
                    o.status === "delivered"
            )
            .reduce((sum, o) => sum + (o.total_amount ?? 0), 0);
    }, [orders]);

    // Gate "Chiedi il conto": vietato finche' c'e' anche un solo ordine in
    // preparazione (submitted o acknowledged). Ready/delivered non bloccano:
    // ready = uscito dalla cucina, delivered = servito al tavolo.
    const hasInProgressOrders = useMemo(
        () =>
            orders.some(
                o => o.status === "submitted" || o.status === "acknowledged"
            ),
        [orders]
    );

    const showBillBlock = activeTab === "orders" && tableTotal > 0;

    const loadOrders = useCallback(async () => {
        if (!session) {
            setOrders([]);
            return;
        }
        setIsLoadingOrders(true);
        setOrdersError(null);
        try {
            const data = await getOrdersForSession(session.jwt);
            setOrders(data.orders);
            onBillRequestedAtChange(data.bill_requested_at);
        } catch (err) {
            if (err instanceof Error) {
                if (err.message.toLowerCase().includes("scaduta")) {
                    clear();
                    onSessionExpired?.();
                    return;
                }
                setOrdersError(err.message);
                return;
            }
            setOrdersError("Errore nel caricamento degli ordini.");
        } finally {
            setIsLoadingOrders(false);
        }
    }, [session, clear, onSessionExpired, onBillRequestedAtChange]);

    const handleCancelConfirm = useCallback(
        async (orderId: string) => {
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
                        onSessionExpired?.();
                        return;
                    }
                    if (msg === "INVALID_STATE_TRANSITION") {
                        setOrdersError("L'ordine non può più essere annullato (già preso in carico dallo staff).");
                        setConfirmingCancelId(null);
                        await loadOrders();
                        return;
                    }
                    setOrdersError(msg);
                    return;
                }
                setOrdersError("Errore durante l'annullamento.");
            } finally {
                setProcessingCancelId(null);
            }
        },
        [session, clear, onSessionExpired, loadOrders]
    );

    // Fetch orders on tab switch / external refresh bump
    useEffect(() => {
        if (isOpen && activeTab === "orders") {
            void loadOrders();
            setConfirmingCancelId(null);
        }
        // ordersRefreshKey intentionally in deps to force refetch on bump
    }, [isOpen, activeTab, loadOrders, ordersRefreshKey]);

    // Realtime subscribe quando tab orders attiva + JWT presente.
    // RLS server-side filtra eventi alla sola sessione customer corrente.
    useEffect(() => {
        const jwt = session?.jwt;
        if (!isOpen || activeTab !== "orders" || !jwt) {
            return;
        }

        let channel: RealtimeChannel | null = null;

        channel = subscribeToSessionOrders(jwt, {
            onUpdate: updatedOrder => {
                setOrders(prev =>
                    prev.map(o =>
                        o.id === updatedOrder.id
                            ? {
                                  ...o,
                                  status: updatedOrder.status,
                                  total_amount: updatedOrder.total_amount,
                                  notes: updatedOrder.notes,
                                  order_group_id: updatedOrder.order_group_id
                              }
                            : o
                    )
                );
            },
            onInsert: newOrder => {
                // Edge case: ordine creato server-side (raro). Refetch defensive
                // per popolare items che NON arrivano via Realtime su orders.
                setOrders(prev => {
                    if (prev.find(o => o.id === newOrder.id)) return prev;
                    void loadOrders();
                    return prev;
                });
            },
            onError: err => {
                const msg = err.message.toLowerCase();
                if (msg.includes("token") || msg.includes("jwt") || msg.includes("auth")) {
                    clear();
                    onSessionExpired?.();
                }
                // Altri errori silenziosi: Realtime auto-reconnect built-in,
                // refresh button manuale + initial load restano fallback.
            }
        });

        return () => {
            channel?.unsubscribe();
        };
    }, [isOpen, activeTab, session?.jwt, loadOrders, clear, onSessionExpired]);

    // Sub customer_sessions lifted al parent (CollectionView) per garantire
    // always-on anche con sheet chiusa (es. chiusura tavolo durante browsing).

    // Handler "Chiedi il conto"
    const handleRequestBill = useCallback(async () => {
        if (!session?.jwt) return;
        setIsRequestingBill(true);
        setBillError(null);
        try {
            const result = await requestBill(session.jwt);
            onBillRequestedAtChange(result.bill_requested_at);
        } catch (err) {
            if (err instanceof Error) {
                if (err.message.toLowerCase().includes("scaduta")) {
                    clear();
                    onSessionExpired?.();
                    return;
                }
                setBillError(err.message);
                return;
            }
            setBillError("Errore durante la richiesta");
        } finally {
            setIsRequestingBill(false);
        }
    }, [session?.jwt, clear, onSessionExpired, onBillRequestedAtChange]);

    return (
        <PublicSheet
            isOpen={isOpen}
            onClose={onClose}
            ariaLabel="Il tuo ordine"
            skeleton={
                <div className={styles.container} aria-hidden="true">
                    <div className={styles.skelInner}>
                        <div className={styles.skelHeader} />
                        <div className={styles.skelTabs} />
                        <div className={styles.skelItem} />
                        <div className={styles.skelItem} />
                        <div className={styles.skelItem} />
                        <div className={styles.skelFooter} />
                    </div>
                </div>
            }
        >
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2 className={styles.title}>Il tuo ordine</h2>
                    <div className={styles.headerActions}>
                        {activeTab === "cart" && !isEmptyCart && (
                            <button
                                type="button"
                                className={styles.clearBtn}
                                onClick={onClear}
                                disabled={maintenance != null}
                            >
                                Svuota
                            </button>
                        )}
                        {activeTab === "orders" && (
                            <button
                                type="button"
                                className={`${styles.refreshBtn} ${isLoadingOrders ? styles.refreshBtnSpinning : ""}`}
                                onClick={() => void loadOrders()}
                                disabled={isLoadingOrders}
                                aria-label="Aggiorna"
                            >
                                <RefreshCw size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className={styles.tabSwitcher}>
                    <div className={styles.tabSwitcherInner}>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === "cart" ? styles.tabBtnActive : ""}`}
                            onClick={() => onTabChange("cart")}
                        >
                            <span>Selezione</span>
                            {cartCount > 0 && (
                                <span
                                    className={`${styles.tabBadge} ${activeTab === "cart" ? styles.tabBadgeActive : ""}`}
                                >
                                    {cartCount}
                                </span>
                            )}
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabBtn} ${activeTab === "orders" ? styles.tabBtnActive : ""}`}
                            onClick={() => onTabChange("orders")}
                        >
                            <span>Ordini</span>
                            {activeOrdersCount > 0 && (
                                <span
                                    className={`${styles.tabBadge} ${activeTab === "orders" ? styles.tabBadgeActive : ""}`}
                                >
                                    {activeOrdersCount}
                                </span>
                            )}
                        </button>
                    </div>
                </div>

                {activeTab === "cart" ? (
                    <>
                        <div className={styles.scrollArea}>
                            {isEmptyCart ? (
                                <div className={styles.empty}>
                                    <p className={styles.emptyTitle}>Nessun piatto scelto</p>
                                    <p className={styles.emptyHint}>
                                        Sfoglia il menu per iniziare il tuo ordine.
                                    </p>
                                </div>
                            ) : (
                                <ul className={styles.list}>
                                    {items.map((item, index) => (
                                        <li key={index} className={styles.listItem}>
                                            <div className={styles.listItemMain}>
                                            <div className={styles.itemInfo}>
                                                <span className={styles.itemName}>{item.name}</span>
                                                {(item.selectedFormat ||
                                                    (item.selectedAddons && item.selectedAddons.length > 0)) && (
                                                    <span className={styles.itemMeta}>
                                                        {item.selectedFormat && (
                                                            <span>{item.selectedFormat.name}</span>
                                                        )}
                                                        {item.selectedAddons && item.selectedAddons.length > 0 && (
                                                            <span>
                                                                {item.selectedAddons
                                                                    .map(a => `+ ${a.name}`)
                                                                    .join(", ")}
                                                            </span>
                                                        )}
                                                        {onEditItem && (
                                                            <button
                                                                type="button"
                                                                className={styles.editLink}
                                                                onClick={() => onEditItem(index, item)}
                                                                disabled={maintenance != null}
                                                            >
                                                                {t("selection.edit")}
                                                            </button>
                                                        )}
                                                    </span>
                                                )}
                                                {item.unitPrice > 0 && (
                                                    <span className={styles.itemPrice}>
                                                        {formatPrice(item.unitPrice)} {t("selection.unit_suffix")}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={styles.itemControls}>
                                                <button
                                                    type="button"
                                                    className={styles.qtyBtn}
                                                    onClick={() =>
                                                        item.qty === 1
                                                            ? onRemove(index)
                                                            : onUpdateQty(index, item.qty - 1)
                                                    }
                                                    aria-label={
                                                        item.qty === 1
                                                            ? t("selection.remove_aria")
                                                            : t("selection.decrease_aria")
                                                    }
                                                    disabled={maintenance != null}
                                                >
                                                    {item.qty === 1 ? (
                                                        <Trash2 size={13} strokeWidth={2} />
                                                    ) : (
                                                        <Minus size={13} strokeWidth={2} />
                                                    )}
                                                </button>
                                                <span className={styles.qtyValue}>{item.qty}</span>
                                                <button
                                                    type="button"
                                                    className={styles.qtyBtn}
                                                    onClick={() => onUpdateQty(index, item.qty + 1)}
                                                    aria-label={t("selection.increase_aria")}
                                                    disabled={maintenance != null}
                                                >
                                                    <Plus size={13} strokeWidth={2} />
                                                </button>
                                            </div>
                                            </div>
                                            {onItemNoteSave && onItemNoteRemove && (
                                                <ItemNoteEditor
                                                    note={item.note ?? null}
                                                    onSave={note => onItemNoteSave(index, note)}
                                                    onRemove={() => onItemNoteRemove(index)}
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {!isEmptyCart && onOrderNoteSave && onOrderNoteRemove && (
                                <OrderNoteEditor
                                    note={orderNote}
                                    onSave={onOrderNoteSave}
                                    onRemove={onOrderNoteRemove}
                                />
                            )}
                        </div>
                        {!isEmptyCart && (
                            <div className={styles.footer}>
                                <div className={styles.footerTotalRow}>
                                    <span className={styles.footerLabel}>Totale stimato</span>
                                    <span className={styles.footerTotal}>{formatPrice(cartTotal)}</span>
                                </div>
                                {orderingActive && onSubmitOrder && (
                                    <>
                                        {maintenance && (
                                            <div
                                                className={styles.maintenanceBanner}
                                                role="status"
                                                aria-live="polite"
                                            >
                                                <AlertCircle
                                                    size={14}
                                                    className={styles.maintenanceIcon}
                                                    aria-hidden="true"
                                                />
                                                <div className={styles.maintenanceText}>
                                                    {maintenance.message}
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            className={`${styles.submitCta}${maintenance ? ` ${styles.submitDisabled}` : ""}`}
                                            onClick={maintenance ? undefined : onSubmitOrder}
                                            disabled={
                                                maintenance != null ||
                                                isSubmitting ||
                                                items.length === 0
                                            }
                                        >
                                            {maintenance
                                                ? "Ordinazioni sospese"
                                                : isSubmitting
                                                    ? "Invio in corso..."
                                                    : `Invia ordine · ${formatPrice(cartTotal)}`}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.scrollArea}>
                        {showBillBlock && (
                            <div className={styles.billBlock}>
                                <div className={styles.billHeader}>
                                    <span className={styles.billLabel}>Il tuo conto</span>
                                    <span className={styles.billAmount}>
                                        {new Intl.NumberFormat("it-IT", {
                                            style: "currency",
                                            currency: "EUR",
                                            minimumFractionDigits: 2
                                        }).format(tableTotal)}
                                    </span>
                                </div>
                                {billRequestedAt ? (
                                    <div className={styles.billRequested}>
                                        <span className={styles.billRequestedDot} aria-hidden="true" />
                                        <span>Conto richiesto. Lo staff sta arrivando.</span>
                                    </div>
                                ) : hasInProgressOrders ? (
                                    <div className={styles.billHint}>
                                        Hai ancora ordini in preparazione — potrai chiedere il conto quando saranno pronti.
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        className={styles.billCta}
                                        onClick={handleRequestBill}
                                        disabled={isRequestingBill || maintenance != null}
                                    >
                                        {isRequestingBill ? "Invio..." : "Chiedi il conto"}
                                    </button>
                                )}
                                {billError && (
                                    <div className={styles.billErrorMsg}>{billError}</div>
                                )}
                            </div>
                        )}

                        {ordersError && (
                            <div className={styles.errorBanner}>{ordersError}</div>
                        )}

                        {isLoadingOrders && orders.length === 0 ? (
                            <div className={styles.loading}>
                                <p className={styles.loadingText}>Caricamento ordini...</p>
                            </div>
                        ) : orders.length === 0 ? (
                            <div className={styles.empty}>
                                <p className={styles.emptyTitle}>Non hai ancora inviato ordini</p>
                                <p className={styles.emptyHint}>
                                    I tuoi ordini compariranno qui dopo l'invio.
                                </p>
                            </div>
                        ) : (
                            <div className={styles.ordersList}>
                                {orders.map(order => {
                                    const isConfirming = confirmingCancelId === order.id;
                                    const isProcessing = processingCancelId === order.id;
                                    const canCancel = order.status === "submitted";
                                    const isCancelled = order.status === "cancelled";

                                    return (
                                        <div
                                            key={order.id}
                                            className={styles.orderCard}
                                            data-status={order.status}
                                        >
                                            {isCancelled ? (
                                                <div className={styles.orderHeader}>
                                                    <span
                                                        className={`${styles.statusPill} ${styles.statusCancelled}`}
                                                    >
                                                        Cancellato
                                                    </span>
                                                    <span className={styles.orderTime}>
                                                        {formatRelativeMinimal(order.cancelled_at ?? order.created_at)}
                                                    </span>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className={styles.orderHeader}>
                                                        <span className={styles.orderTime}>
                                                            Inviato {formatRelativeMinimal(order.created_at)}
                                                        </span>
                                                    </div>
                                                    <OrderStatusStepper order={order} />
                                                </>
                                            )}

                                            <ul className={styles.itemsList}>
                                                {(order.items ?? []).map(item => (
                                                    <li key={item.id} className={styles.itemRow}>
                                                        <span className={styles.itemQty}>
                                                            {item.quantity}x
                                                        </span>
                                                        <span className={styles.itemName}>
                                                            {item.product_name_snapshot}
                                                        </span>
                                                        <span className={styles.itemPrice}>
                                                            {formatPrice(item.line_total)}
                                                        </span>
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
                                                    <span className={styles.confirmLabel}>
                                                        Vuoi davvero annullare?
                                                    </span>
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
                )}
            </div>
        </PublicSheet>
    );
}
