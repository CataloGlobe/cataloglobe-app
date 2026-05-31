import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { ActivitySelectorCombobox } from "@/components/ui/ActivitySelectorCombobox/ActivitySelectorCombobox";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";

import {
    listOrdersForActivity,
    acknowledgeOrder,
    deliverOrder,
    cancelOrderAdmin,
    rectifyOrder,
    getOrdersCountToday,
    getOrdersServedToday
} from "@/services/supabase/orders";
import type {
    V2Order,
    V2OrderWithItems,
    ListOrdersOptions,
    RectifyOrderItem,
    V2TableWithState
} from "@/types/orders";

import { listTables, listTablesWithState } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";

import OrderCard from "./OrderCard";
import OrderDetailDrawer from "./OrderDetailDrawer";
import OrderCancelDrawer from "./OrderCancelDrawer";
import OrderRectifyDrawer from "./OrderRectifyDrawer";
import { OrdersKpiBar } from "./OrdersKpiBar";
import styles from "./Orders.module.scss";

type OrderStatusFilter =
    | "all"
    | "submitted"
    | "acknowledged"
    | "delivered"
    | "cancelled";

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
    const [orders, setOrders] = useState<V2OrderWithItems[]>([]);
    const [tables, setTables] = useState<V2Table[]>([]);
    const [tablesWithState, setTablesWithState] = useState<V2TableWithState[]>([]);
    const [ordersTodayCount, setOrdersTodayCount] = useState<number>(0);
    const [ordersServedToday, setOrdersServedToday] = useState<V2Order[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters (tab Comande)
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Auto-refresh
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

    // ── KPI data (orders today + served today) ──
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
            /* silent: KPI degrada a 0 */
        }
    }, [tenantId, selectedActivityId]);

    useEffect(() => {
        void loadKpi();
    }, [loadKpi]);

    // ── Orders load (tab Comande) ──
    const loadOrders = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setOrders([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const options: ListOrdersOptions = {
                status: statusFilter === "all" ? undefined : statusFilter,
                tableId: tableFilter === "all" ? undefined : tableFilter,
                includeItems: true,
                limit: 100
            };
            const data = await listOrdersForActivity(
                tenantId,
                selectedActivityId,
                options
            );
            setOrders(data);
        } catch {
            showToast({ message: "Impossibile caricare gli ordini", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, selectedActivityId, statusFilter, tableFilter, showToast]);

    useEffect(() => {
        void loadOrders();
    }, [loadOrders]);

    // ── Refresh totale (header button) ──
    const refreshAll = useCallback(() => {
        void loadOrders();
        void loadTables();
        void loadTablesWithState();
        void loadKpi();
    }, [loadOrders, loadTables, loadTablesWithState, loadKpi]);

    // ── Auto-refresh: tutto in batch ──
    useEffect(() => {
        if (!autoRefreshEnabled) return;
        const id = setInterval(() => {
            refreshAll();
        }, AUTO_REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [autoRefreshEnabled, refreshAll]);

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
                    disabled={!selectedActivityId || isLoading}
                >
                    Aggiorna
                </Button>
                <label className={styles.autoRefreshToggle}>
                    <input
                        type="checkbox"
                        checked={autoRefreshEnabled}
                        onChange={e => setAutoRefreshEnabled(e.target.checked)}
                    />
                    <Text variant="body-sm">Auto-aggiorna (30s)</Text>
                </label>
            </div>
        ),
        [tenantId, selectedActivityId, refreshAll, isLoading, autoRefreshEnabled]
    );

    usePageHeader({
        title: "Ordini",
        subtitle: "Dashboard live degli ordini in corso.",
        actions: headerActions,
        sticky: true
    });

    // ── Filtering (client-side: search + customer_name) ──
    const filteredOrders = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (q.length === 0) return orders;
        return orders.filter(o => {
            if (o.customer_name_snapshot?.toLowerCase().includes(q)) return true;
            const tableLabel =
                tables.find(t => t.id === o.table_id)?.label.toLowerCase() ?? "";
            if (tableLabel.includes(q)) return true;
            return false;
        });
    }, [orders, searchQuery, tables]);

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
                void loadOrders();
                return;
            }
            if (err.message === "INVALID_STATE_TRANSITION") {
                const details = (err as Error & { details?: { current_status?: string } })
                    .details;
                showToast({
                    message: `Impossibile ${action}: stato corrente ${details?.current_status ?? "non valido"}`,
                    type: "error"
                });
                void loadOrders();
                return;
            }
        }
        showToast({ message: `Errore durante ${action}`, type: "error" });
    }

    async function handleAcknowledge(order: V2OrderWithItems) {
        try {
            await acknowledgeOrder(order.id, order.version);
            showToast({
                message: `Ordine ${labelFor(order)} confermato`,
                type: "success"
            });
            await loadOrders();
        } catch (err) {
            handleTransitionError(err, order, "la conferma");
        }
    }

    async function handleDeliver(order: V2OrderWithItems) {
        try {
            await deliverOrder(order.id, order.version);
            showToast({
                message: `Ordine ${labelFor(order)} consegnato`,
                type: "success"
            });
            await loadOrders();
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
            await cancelOrderAdmin(
                orderToCancel.id,
                orderToCancel.version,
                trimmed.length > 0 ? trimmed : undefined
            );
            showToast({
                message: `Ordine ${labelFor(orderToCancel)} cancellato`,
                type: "success"
            });
            setIsCancelOpen(false);
            setOrderToCancel(null);
            await loadOrders();
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
            await loadOrders();
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
                        void loadOrders();
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
                        void loadOrders();
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
                    <Tabs<OrderStatusFilter>
                        value={statusFilter}
                        onChange={setStatusFilter}
                    >
                        <Tabs.List>
                            <Tabs.Tab value="all">Tutti</Tabs.Tab>
                            <Tabs.Tab value="submitted">Da prendere</Tabs.Tab>
                            <Tabs.Tab value="acknowledged">In corso</Tabs.Tab>
                            <Tabs.Tab value="delivered">Consegnati</Tabs.Tab>
                            <Tabs.Tab value="cancelled">Cancellati</Tabs.Tab>
                        </Tabs.List>
                    </Tabs>

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

                    {!isLoading && filteredOrders.length === 0 ? (
                        <EmptyState
                            icon={<ClipboardList size={40} strokeWidth={1.5} />}
                            title={
                                orders.length === 0 ? "Nessun ordine" : "Nessun risultato"
                            }
                            description={
                                orders.length === 0
                                    ? "Quando i clienti inizieranno a ordinare, gli ordini compariranno qui."
                                    : "Modifica i filtri per vedere altri risultati."
                            }
                        />
                    ) : (
                        <div className={styles.cardsList}>
                            {filteredOrders.map(order => {
                                const table = tables.find(t => t.id === order.table_id);
                                return (
                                    <OrderCard
                                        key={order.id}
                                        order={order}
                                        tableLabel={table?.label ?? "?"}
                                        tableZone={table?.zone_name ?? null}
                                        onAcknowledge={handleAcknowledge}
                                        onDeliver={handleDeliver}
                                        onCancel={handleCancelOpen}
                                        onRectify={handleRectifyOpen}
                                        onViewDetail={handleViewDetail}
                                    />
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {mainTab === "tavoli" && tenantId && selectedActivityId && (
                <TablesLiveView
                    tenantId={tenantId}
                    activityId={selectedActivityId}
                    autoRefreshMs={autoRefreshEnabled ? AUTO_REFRESH_INTERVAL_MS : undefined}
                />
            )}

            {mainTab === "storico" && (
                <div className={styles.historyPlaceholder}>
                    <div className={styles.historyFilters}>
                        <select className={styles.historyFilter} disabled>
                            <option>Tutte</option>
                            <option>Servite</option>
                            <option>Annullate</option>
                        </select>
                        <select className={styles.historyFilter} disabled>
                            <option>Tutti i tavoli</option>
                        </select>
                    </div>
                    <EmptyState
                        icon={<ClipboardList size={40} strokeWidth={1.5} />}
                        title="Storico non ancora implementato"
                        description="Funzionalita' completa (lista sessioni servite + Ripristina) in arrivo nello Step 5."
                    />
                </div>
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
        </section>
    );
}
