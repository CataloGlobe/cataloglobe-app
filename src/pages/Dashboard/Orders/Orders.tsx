import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ClipboardList, RefreshCw } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
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
    getOrdersCountToday,
    getOrdersServedToday,
    listOrdersHistoryToday
} from "@/services/supabase/orders";
import type {
    V2Order,
    V2OrderWithItems,
    RectifyOrderItem,
    V2TableWithState
} from "@/types/orders";

import { listTables, listTablesWithState } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";

import OrderDetailDrawer from "./OrderDetailDrawer";
import OrderCancelDrawer from "./OrderCancelDrawer";
import OrderRectifyDrawer from "./OrderRectifyDrawer";
import OrderHistoryRow from "./OrderHistoryRow";
import { OrdersKpiBar } from "./OrdersKpiBar";
import OrdersKanban from "./OrdersKanban";
import { useActiveOrdersRealtime } from "./hooks/useActiveOrdersRealtime";
import styles from "./Orders.module.scss";

type MainTab = "comande" | "tavoli" | "storico";

const AUTO_REFRESH_STORAGE_KEY = "ordersAutoRefresh";
const ACTIVITY_STORAGE_KEY = "cataloglobe:orders:lastActivityId";
const AUTO_REFRESH_INTERVAL_MS = 30_000;

export default function Orders() {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    // Activity selection (via combobox, persiste localStorage)
    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

    // Main tabs (3 sezioni principali)
    const [mainTab, setMainTab] = useState<MainTab>("comande");

    // Data
    const [tables, setTables] = useState<V2Table[]>([]);
    const [tablesWithState, setTablesWithState] = useState<V2TableWithState[]>([]);
    const [ordersTodayCount, setOrdersTodayCount] = useState<number>(0);
    const [ordersServedToday, setOrdersServedToday] = useState<V2Order[]>([]);

    // Storico (delivered + cancelled della giornata operativa)
    const [historyOrders, setHistoryOrders] = useState<V2OrderWithItems[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<Error | null>(null);

    // Filters (tab Comande)
    const [searchQuery, setSearchQuery] = useState("");
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Auto-refresh (fallback layer over realtime — kept on for KPI counters
    // and the Tavoli tab snapshot, which are still REST-driven).
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(
        () => localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === "true"
    );

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

    // ── KPI data (orders today + served today). Re-fetched on order
    // transitions that move a card off the kanban (delivered / cancelled).
    const loadKpi = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setOrdersTodayCount(0);
            setOrdersServedToday([]);
            return;
        }
        try {
            const [count, served] = await Promise.all([
                getOrdersCountToday(tenantId, selectedActivityId),
                getOrdersServedToday(tenantId, selectedActivityId)
            ]);
            setOrdersTodayCount(count);
            setOrdersServedToday(served);
        } catch {
            /* silent: KPI gracefully degrada a 0 */
        }
    }, [tenantId, selectedActivityId]);

    useEffect(() => {
        void loadKpi();
    }, [loadKpi]);

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
    const handleOrderLeftBoard = useCallback(() => {
        // KPI counters depend on "served today"; refresh on every exit
        // from the active board to keep the bar in sync without polling.
        void loadKpi();
    }, [loadKpi]);

    const {
        orders: activeOrders,
        isLoading: isLoadingOrders,
        error: ordersError,
        refetch: refetchOrders,
        applyLocalPatch
    } = useActiveOrdersRealtime(tenantId, selectedActivityId, {
        onOrderLeftBoard: handleOrderLeftBoard
    });

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

    // ── Tables with state (per KPI bar) ──
    const loadTablesWithState = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setTablesWithState([]);
            return;
        }
        try {
            const data = await listTablesWithState(tenantId, selectedActivityId);
            setTablesWithState(data);
        } catch {
            /* silent: KPI gracefully degrada a 0 */
        }
    }, [tenantId, selectedActivityId]);

    useEffect(() => {
        void loadTablesWithState();
    }, [loadTablesWithState]);

    // Carica lo Storico solo quando la tab e' attiva (o si cambia sede / si rientra).
    useEffect(() => {
        if (mainTab !== "storico") return;
        void loadHistory();
    }, [mainTab, loadHistory]);

    // ── Refresh totale (header button). Triggers kanban refetch + all REST sources. ──
    const refreshAll = useCallback(() => {
        void refetchOrders();
        void loadTables();
        void loadTablesWithState();
        void loadKpi();
    }, [refetchOrders, loadTables, loadTablesWithState, loadKpi]);

    // ── Auto-refresh: KPI + tables snapshot only (kanban is realtime).
    useEffect(() => {
        if (!autoRefreshEnabled) return;
        const id = setInterval(() => {
            void loadTables();
            void loadTablesWithState();
            void loadKpi();
        }, AUTO_REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [autoRefreshEnabled, loadTables, loadTablesWithState, loadKpi]);

    useEffect(() => {
        localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefreshEnabled));
    }, [autoRefreshEnabled]);

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
                <label className={styles.autoRefreshToggle}>
                    <input
                        type="checkbox"
                        checked={autoRefreshEnabled}
                        onChange={e => setAutoRefreshEnabled(e.target.checked)}
                    />
                    <Text variant="body-sm">Auto-aggiorna KPI (30s)</Text>
                </label>
            </div>
        ),
        [tenantId, selectedActivityId, refreshAll, isLoadingOrders, autoRefreshEnabled]
    );

    usePageHeader({
        title: "Ordini",
        subtitle: "Dashboard live degli ordini in corso.",
        actions: headerActions,
        sticky: true
    });

    // ── Filtering (client-side: search + tableId) ──
    const filteredOrders = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        const byTable =
            tableFilter === "all"
                ? activeOrders
                : activeOrders.filter(o => o.table_id === tableFilter);
        if (q.length === 0) return byTable;
        return byTable.filter(o => {
            if (o.customer_name_snapshot?.toLowerCase().includes(q)) return true;
            const tableLabel =
                tables.find(t => t.id === o.table_id)?.label.toLowerCase() ?? "";
            return tableLabel.includes(q);
        });
    }, [activeOrders, searchQuery, tableFilter, tables]);

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

    async function handleDeliver(order: V2OrderWithItems) {
        try {
            const res = await deliverOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                delivered_at: res.delivered_at
            });
            showToast({
                message: `Ordine ${labelFor(order)} consegnato`,
                type: "success"
            });
            void loadKpi();
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
            // (acknowledged e' uno status attivo). Refetch KPI per "servite oggi".
            setHistoryOrders(prev => prev.filter(o => o.id !== order.id));
            showToast({
                message: `Ordine ${labelFor(order)} ripristinato`,
                type: "success"
            });
            void loadKpi();
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
            {mainTab !== "storico" && tenantId && selectedActivityId && (
                <OrdersKpiBar
                    tables={tablesWithState}
                    ordersTodayCount={ordersTodayCount}
                    ordersServedToday={ordersServedToday}
                />
            )}

            <Tabs<MainTab> value={mainTab} onChange={setMainTab}>
                <Tabs.List>
                    <Tabs.Tab value="comande">Comande</Tabs.Tab>
                    <Tabs.Tab value="tavoli">Tavoli</Tabs.Tab>
                    <Tabs.Tab value="storico">Storico</Tabs.Tab>
                </Tabs.List>
            </Tabs>

            {mainTab === "comande" && (
                <>
                    <div className={styles.filtersRow}>
                        <FilterBar
                            search={{
                                value: searchQuery,
                                onChange: setSearchQuery,
                                placeholder: "Cerca per cliente o tavolo..."
                            }}
                        />
                        {tables.length > 0 && (
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
                        )}
                    </div>

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
