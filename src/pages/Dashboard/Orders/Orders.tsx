import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ClipboardList, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { ActivitySelectorCombobox } from "@/components/ui/ActivitySelectorCombobox/ActivitySelectorCombobox";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import { TableDetailDrawer } from "@/components/Tables/TableDetailDrawer/TableDetailDrawer";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";

import {
    acknowledgeOrder,
    markOrderReady,
    deliverOrder,
    cancelOrderAdmin,
    rectifyOrder,
    restoreOrder,
    unacknowledgeOrder,
    unreadyOrder,
    listOrdersHistoryToday
} from "@/services/supabase/orders";
import type {
    V2OrderWithItems,
    RectifyOrderItem
} from "@/types/orders";

import { listTables } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";

import OrderDetailDrawer from "./OrderDetailDrawer";
import OrderCancelDrawer from "./OrderCancelDrawer";
import OrderRectifyDrawer from "./OrderRectifyDrawer";
import OrderHistoryRow from "./OrderHistoryRow";
import OrdersKanban from "./OrdersKanban";
import { useActiveOrdersRealtime } from "./hooks/useActiveOrdersRealtime";
import { useNewOrderAlert } from "./hooks/useNewOrderAlert";
import styles from "./Orders.module.scss";

type MainTab = "comande" | "tavoli" | "storico";

const ACTIVITY_STORAGE_KEY = "cataloglobe:orders:lastActivityId";

export default function Orders() {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    // Activity selection (via combobox, persiste localStorage)
    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

    // Main tabs (3 sezioni principali)
    const [mainTab, setMainTab] = useState<MainTab>("comande");

    // Data
    const [tables, setTables] = useState<V2Table[]>([]);

    // Storico (delivered + cancelled della giornata operativa)
    const [historyOrders, setHistoryOrders] = useState<V2OrderWithItems[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<Error | null>(null);

    // Filtri (tab Comande): solo dropdown tavolo.
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Detail drawer
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [orderInDetail, setOrderInDetail] = useState<V2OrderWithItems | null>(null);

    // Cancel drawer
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<V2OrderWithItems | null>(null);

    // Rectify drawer
    const [isRectifyOpen, setIsRectifyOpen] = useState(false);
    const [orderToRectify, setOrderToRectify] = useState<V2OrderWithItems | null>(null);

    // Table detail drawer (Step 4c — apertura via click su card in tab "Tavoli")
    const [isTableDetailOpen, setIsTableDetailOpen] = useState(false);
    const [tableInDetailId, setTableInDetailId] = useState<string | null>(null);

    // ── Storico (delivered + cancelled del giorno operativo) ──
    // Niente realtime: vista review, fetch on open + refetch dopo Ripristina.
    const loadHistory = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setHistoryOrders([]);
            setHistoryError(null);
            return;
        }
        setIsHistoryLoading(true);
        setHistoryError(null);
        try {
            const data = await listOrdersHistoryToday(tenantId, selectedActivityId);
            setHistoryOrders(data);
        } catch (err) {
            setHistoryError(err instanceof Error ? err : new Error("Errore caricamento storico"));
        } finally {
            setIsHistoryLoading(false);
        }
    }, [tenantId, selectedActivityId]);

    // ── Realtime active orders board ──
    // triggerAlert e' definito DOPO la chiamata a useActiveOrdersRealtime
    // (perche' richiede submittedCount derivato da activeOrders). Si passa
    // un thunk che de-referenzia il ref aggiornato sotto.
    const triggerAlertRef = useRef<() => void>(() => {});
    const {
        orders: activeOrders,
        isLoading: isLoadingOrders,
        error: ordersError,
        refetch: refetchOrders,
        applyLocalPatch
    } = useActiveOrdersRealtime(tenantId, selectedActivityId, {
        onNewOrder: () => triggerAlertRef.current()
    });

    // ── Alert nuova comanda (suono + titolo tab + pulse) ──
    const submittedCount = useMemo(
        () => activeOrders.filter(o => o.status === "submitted").length,
        [activeOrders]
    );
    const { soundEnabled, toggleSound, triggerAlert, pulseToken } = useNewOrderAlert({
        submittedCount
    });
    triggerAlertRef.current = triggerAlert;

    // ── Tables load (per lookup label/zone nel filtro tab Comande) ──
    const loadTables = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setTables([]);
            return;
        }
        try {
            const data = await listTables(tenantId, selectedActivityId);
            setTables(data);
        } catch {
            /* silent: lookup ottimizzazione */
        }
    }, [tenantId, selectedActivityId]);

    useEffect(() => {
        void loadTables();
    }, [loadTables]);

    // Reset filtro tavolo al cambio sede: il tableFilter potrebbe contenere
    // un table_id non piu' valido nella nuova sede, nascondendo silenziosamente
    // tutte le comande (kanban vuoto senza messaggio).
    useEffect(() => {
        setTableFilter("all");
    }, [selectedActivityId]);

    // Carica lo Storico solo quando la tab e' attiva (o si cambia sede / si rientra).
    useEffect(() => {
        if (mainTab !== "storico") return;
        void loadHistory();
    }, [mainTab, loadHistory]);

    // ── Refresh totale (header button) ──
    // Force-refetch del kanban realtime + lookup tavoli per il dropdown filtro.
    const refreshAll = useCallback(() => {
        void refetchOrders();
        void loadTables();
    }, [refetchOrders, loadTables]);

    const headerActions = useMemo(
        () => (
            <div className={styles.headerActions}>
                {tenantId && (
                    <ActivitySelectorCombobox
                        tenantId={tenantId}
                        value={selectedActivityId}
                        onChange={setSelectedActivityId}
                        storageKey={ACTIVITY_STORAGE_KEY}
                    />
                )}
                <Button
                    variant="secondary"
                    leftIcon={<RefreshCw size={16} />}
                    onClick={refreshAll}
                    disabled={!selectedActivityId || isLoadingOrders}
                >
                    Aggiorna
                </Button>
                <button
                    type="button"
                    className={styles.soundToggle}
                    onClick={toggleSound}
                    aria-pressed={soundEnabled}
                    aria-label={
                        soundEnabled
                            ? "Disattiva suono nuove comande"
                            : "Attiva suono nuove comande"
                    }
                    title={
                        soundEnabled
                            ? "Suono nuove comande attivo"
                            : "Suono nuove comande disattivato"
                    }
                >
                    {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
            </div>
        ),
        [tenantId, selectedActivityId, refreshAll, isLoadingOrders, soundEnabled, toggleSound]
    );

    usePageHeader({
        title: "Ordini",
        subtitle: "Dashboard live degli ordini in corso.",
        actions: headerActions,
        sticky: true
    });

    // ── Filtering (client-side: solo tableId) ──
    const filteredOrders = useMemo(() => {
        if (tableFilter === "all") return activeOrders;
        return activeOrders.filter(o => o.table_id === tableFilter);
    }, [activeOrders, tableFilter]);

    function labelFor(order: V2OrderWithItems): string {
        const t = tables.find(tt => tt.id === order.table_id);
        return t ? t.label : `#${order.id.slice(0, 6)}`;
    }

    function handleTransitionError(
        err: unknown,
        order: V2OrderWithItems,
        action: string
    ) {
        if (err instanceof Error) {
            if (err.message === "OPTIMISTIC_LOCK_CONFLICT") {
                showToast({
                    message:
                        "L'ordine è stato modificato da un altro utente, aggiorno la lista",
                    type: "warning"
                });
                void refetchOrders();
                return;
            }
            if (err.message === "INVALID_STATE_TRANSITION") {
                const details = (err as Error & { details?: { current_status?: string } })
                    .details;
                showToast({
                    message: `Impossibile ${action}: stato corrente ${details?.current_status ?? "non valido"}`,
                    type: "error"
                });
                void refetchOrders();
                return;
            }
        }
        showToast({ message: `Errore durante ${action}`, type: "error" });
    }

    async function handleAcknowledge(order: V2OrderWithItems) {
        try {
            const res = await acknowledgeOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                acknowledged_at: res.acknowledged_at
            });
            showToast({
                message: `Ordine ${labelFor(order)} confermato`,
                type: "success"
            });
        } catch (err) {
            handleTransitionError(err, order, "la conferma");
        }
    }

    async function handleMarkReady(order: V2OrderWithItems) {
        try {
            const res = await markOrderReady(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                ready_at: res.ready_at
            });
            showToast({
                message: `Ordine ${labelFor(order)} segnato come pronto`,
                type: "success"
            });
        } catch (err) {
            handleTransitionError(err, order, "la marcatura come pronto");
        }
    }

    async function handleUnacknowledge(order: V2OrderWithItems) {
        try {
            const res = await unacknowledgeOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                acknowledged_at: null
            });
            showToast({
                message: `Ordine ${labelFor(order)} rimesso in Nuove`,
                type: "info"
            });
        } catch (err) {
            handleTransitionError(err, order, "il rimettere in Nuove");
        }
    }

    async function handleUnready(order: V2OrderWithItems) {
        try {
            const res = await unreadyOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                ready_at: null
            });
            showToast({
                message: `Ordine ${labelFor(order)} rimesso in lavorazione`,
                type: "info"
            });
        } catch (err) {
            handleTransitionError(err, order, "il rimettere in lavorazione");
        }
    }

    async function handleDeliver(order: V2OrderWithItems) {
        try {
            const res = await deliverOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                delivered_at: res.delivered_at
            });
            // Undo inline: usa la versione post-deliver (res.version), NON
            // order.version che e' ormai stale. handleRestore esistente non
            // serve qui — chiamiamo direttamente restoreOrder per evitare
            // di propagare la version stale tramite l'order originale.
            showToast({
                message: `Ordine ${labelFor(order)} servito`,
                type: "success",
                actionLabel: "Annulla",
                onAction: () => {
                    void (async () => {
                        try {
                            const restored = await restoreOrder(res.order_id, res.version);
                            applyLocalPatch({
                                id: restored.order_id,
                                status: restored.status,
                                version: restored.version,
                                delivered_at: null,
                                ready_at: null
                            });
                            showToast({
                                message: `Ordine ${labelFor(order)} ripristinato`,
                                type: "info"
                            });
                        } catch (err) {
                            handleTransitionError(err, order, "il ripristino");
                        }
                    })();
                }
            });
        } catch (err) {
            handleTransitionError(err, order, "la consegna");
        }
    }

    function handleViewDetail(order: V2OrderWithItems) {
        setOrderInDetail(order);
        setIsDetailOpen(true);
    }

    function handleCancelOpen(order: V2OrderWithItems) {
        setOrderToCancel(order);
        setIsCancelOpen(true);
    }

    async function handleCancelConfirm(reason: string) {
        if (!orderToCancel) return;
        const trimmed = reason.trim();
        try {
            const res = await cancelOrderAdmin(
                orderToCancel.id,
                orderToCancel.version,
                trimmed.length > 0 ? trimmed : undefined
            );
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                cancelled_at: res.cancelled_at,
                cancelled_by: res.cancelled_by,
                cancellation_reason: res.cancellation_reason
            });
            showToast({
                message: `Ordine ${labelFor(orderToCancel)} cancellato`,
                type: "success"
            });
            setIsCancelOpen(false);
            setOrderToCancel(null);
        } catch (err) {
            if (err instanceof Error && err.message === "REASON_TOO_LONG") {
                showToast({
                    message: "Il motivo è troppo lungo (max 500 caratteri)",
                    type: "error"
                });
                return;
            }
            handleTransitionError(err, orderToCancel, "la cancellazione");
            setIsCancelOpen(false);
            setOrderToCancel(null);
        }
    }

    function handleRectifyOpen(order: V2OrderWithItems) {
        setOrderToRectify(order);
        setIsRectifyOpen(true);
    }

    async function handleRectifyConfirm(
        items: RectifyOrderItem[],
        reason: string
    ) {
        if (!orderToRectify) return;
        try {
            await rectifyOrder(
                orderToRectify.id,
                items,
                reason.length > 0 ? reason : undefined
            );
            showToast({ message: "Rettifica registrata", type: "success" });
            setIsRectifyOpen(false);
            setOrderToRectify(null);
            void refetchOrders();
        } catch (err) {
            if (err instanceof Error) {
                switch (err.message) {
                    case "EMPTY_RECTIFICATION":
                        showToast({
                            message: "Seleziona almeno un articolo da stornare",
                            type: "error"
                        });
                        return;
                    case "INVALID_RECTIFICATION_QUANTITY":
                        showToast({
                            message: "Quantità di storno non valida",
                            type: "error"
                        });
                        return;
                    case "REASON_TOO_LONG":
                        showToast({
                            message: "Il motivo è troppo lungo (max 500 caratteri)",
                            type: "error"
                        });
                        return;
                    case "INVALID_PARENT":
                        showToast({
                            message: "Non puoi rettificare una rettifica esistente",
                            type: "error"
                        });
                        setIsRectifyOpen(false);
                        setOrderToRectify(null);
                        void refetchOrders();
                        return;
                    case "INVALID_PARENT_STATE": {
                        const details = (err as Error & {
                            details?: { current_status?: string };
                        }).details;
                        showToast({
                            message: `Impossibile rettificare: stato corrente ${details?.current_status ?? "non valido"}`,
                            type: "error"
                        });
                        setIsRectifyOpen(false);
                        setOrderToRectify(null);
                        void refetchOrders();
                        return;
                    }
                    case "INVALID_RECTIFICATION_ITEMS": {
                        const details = (err as Error & {
                            details?: { reason?: string };
                        }).details;
                        const subReason = details?.reason;
                        let msg = "Rettifica non valida";
                        if (subReason === "STORNO_QTY_EXCEEDS_ORIGINAL")
                            msg = "Quantità di storno superiore all'originale";
                        else if (subReason === "ORDER_ITEM_NOT_FOUND")
                            msg = "Articolo non trovato nell'ordine";
                        else if (subReason === "INVALID_STORNO_ITEM")
                            msg = "Articolo non rettificabile";
                        showToast({ message: msg, type: "error" });
                        return;
                    }
                }
            }
            showToast({ message: "Errore durante la rettifica", type: "error" });
        }
    }

    async function handleRestore(order: V2OrderWithItems) {
        try {
            await restoreOrder(order.id, order.version);
            // Rimuovi la riga dalla lista; rientrera' nel kanban via realtime
            // (acknowledged e' uno status attivo).
            setHistoryOrders(prev => prev.filter(o => o.id !== order.id));
            showToast({
                message: `Ordine ${labelFor(order)} ripristinato`,
                type: "success"
            });
        } catch (err) {
            if (err instanceof Error) {
                if (err.message === "OPTIMISTIC_LOCK_CONFLICT") {
                    showToast({
                        message:
                            "L'ordine è stato modificato da un altro utente, aggiorno lo storico",
                        type: "warning"
                    });
                    void loadHistory();
                    return;
                }
                if (err.message === "INVALID_STATE_TRANSITION") {
                    const details = (err as Error & {
                        details?: { current_status?: string };
                    }).details;
                    showToast({
                        message: `Impossibile ripristinare: stato corrente ${details?.current_status ?? "non valido"}`,
                        type: "error"
                    });
                    void loadHistory();
                    return;
                }
            }
            showToast({ message: "Errore durante il ripristino", type: "error" });
        }
    }

    return (
        <section className={styles.container}>
            <Tabs<MainTab> value={mainTab} onChange={setMainTab}>
                <Tabs.List>
                    <Tabs.Tab value="comande">Comande</Tabs.Tab>
                    <Tabs.Tab value="tavoli">Tavoli</Tabs.Tab>
                    <Tabs.Tab value="storico">Storico</Tabs.Tab>
                </Tabs.List>
            </Tabs>

            {mainTab === "comande" && (
                <>
                    {tables.length > 0 && (
                        <div className={styles.filtersRow}>
                            <select
                                className={styles.tableFilter}
                                value={tableFilter}
                                onChange={e => setTableFilter(e.target.value)}
                            >
                                <option value="all">Tutti i tavoli</option>
                                {tables.map(t => (
                                    <option key={t.id} value={t.id}>
                                        {t.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {!selectedActivityId ? (
                        <EmptyState
                            icon={<ClipboardList size={40} strokeWidth={1.5} />}
                            title="Seleziona una sede"
                            description="Scegli una sede per visualizzare le comande in corso."
                        />
                    ) : (
                        <OrdersKanban
                            orders={filteredOrders}
                            tables={tables}
                            isLoading={isLoadingOrders}
                            error={ordersError}
                            onRetry={() => void refetchOrders()}
                            onAcknowledge={handleAcknowledge}
                            onMarkReady={handleMarkReady}
                            onDeliver={handleDeliver}
                            onCancel={handleCancelOpen}
                            onRectify={handleRectifyOpen}
                            onViewDetail={handleViewDetail}
                            onUnacknowledge={handleUnacknowledge}
                            onUnready={handleUnready}
                            pulseSubmittedToken={pulseToken}
                        />
                    )}
                </>
            )}

            {mainTab === "tavoli" && tenantId && selectedActivityId && (
                <TablesLiveView
                    tenantId={tenantId}
                    activityId={selectedActivityId}
                    onTableClick={tableId => {
                        setTableInDetailId(tableId);
                        setIsTableDetailOpen(true);
                    }}
                />
            )}

            {mainTab === "storico" && (
                <>
                    {!selectedActivityId ? (
                        <EmptyState
                            icon={<ClipboardList size={40} strokeWidth={1.5} />}
                            title="Seleziona una sede"
                            description="Scegli una sede per visualizzare lo storico della giornata."
                        />
                    ) : historyError ? (
                        <EmptyState
                            icon={<AlertCircle size={40} strokeWidth={1.5} />}
                            title="Errore caricamento storico"
                            description={historyError.message}
                            action={
                                <Button variant="secondary" onClick={() => void loadHistory()}>
                                    Riprova
                                </Button>
                            }
                        />
                    ) : isHistoryLoading ? (
                        <EmptyState
                            icon={<ClipboardList size={40} strokeWidth={1.5} />}
                            title="Caricamento..."
                            description="Recupero degli ordini conclusi oggi."
                        />
                    ) : historyOrders.length === 0 ? (
                        <EmptyState
                            icon={<ClipboardList size={40} strokeWidth={1.5} />}
                            title="Nessun ordine concluso oggi"
                            description="Gli ordini serviti o annullati nella giornata operativa appariranno qui."
                        />
                    ) : (
                        <div className={styles.historyList}>
                            {historyOrders.map(o => (
                                <OrderHistoryRow
                                    key={o.id}
                                    order={o}
                                    tableLabel={
                                        tables.find(t => t.id === o.table_id)?.label ??
                                        `#${o.id.slice(0, 6)}`
                                    }
                                    tableZone={
                                        tables.find(t => t.id === o.table_id)?.zone_name ?? null
                                    }
                                    onRestore={handleRestore}
                                    onViewDetail={handleViewDetail}
                                />
                            ))}
                        </div>
                    )}
                </>
            )}

            <OrderDetailDrawer
                open={isDetailOpen}
                order={orderInDetail}
                tableLabel={
                    tables.find(t => t.id === orderInDetail?.table_id)?.label ?? "?"
                }
                tableZone={
                    tables.find(t => t.id === orderInDetail?.table_id)?.zone_name ?? null
                }
                onClose={() => {
                    setIsDetailOpen(false);
                    setOrderInDetail(null);
                }}
            />

            <OrderCancelDrawer
                open={isCancelOpen}
                order={orderToCancel}
                tableLabel={
                    tables.find(t => t.id === orderToCancel?.table_id)?.label
                }
                onClose={() => {
                    setIsCancelOpen(false);
                    setOrderToCancel(null);
                }}
                onConfirm={handleCancelConfirm}
            />

            <OrderRectifyDrawer
                open={isRectifyOpen}
                order={orderToRectify}
                tableLabel={
                    tables.find(t => t.id === orderToRectify?.table_id)?.label ?? "?"
                }
                tableZone={
                    tables.find(t => t.id === orderToRectify?.table_id)?.zone_name ?? null
                }
                onClose={() => {
                    setIsRectifyOpen(false);
                    setOrderToRectify(null);
                }}
                onConfirm={handleRectifyConfirm}
            />

            <TableDetailDrawer
                open={isTableDetailOpen}
                tenantId={tenantId}
                activityId={selectedActivityId}
                tableId={tableInDetailId}
                onClose={() => {
                    setIsTableDetailOpen(false);
                    setTableInDetailId(null);
                }}
            />
        </section>
    );
}
