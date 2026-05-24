import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";

import PageHeader from "@/components/ui/PageHeader/PageHeader";
import FilterBar from "@/components/ui/FilterBar/FilterBar";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";

import {
    listOrdersForActivity,
    acknowledgeOrder,
    deliverOrder
} from "@/services/supabase/orders";
import type { V2OrderWithItems, ListOrdersOptions } from "@/types/orders";

import { listTables } from "@/services/supabase/tables";
import type { V2Table } from "@/types/orders";

import { getActivities } from "@/services/supabase/activities";
import type { V2Activity } from "@/types/activity";

import OrderCard from "./OrderCard";
import styles from "./Orders.module.scss";

type OrderStatusFilter =
    | "all"
    | "submitted"
    | "acknowledged"
    | "delivered"
    | "cancelled";

const AUTO_REFRESH_STORAGE_KEY = "ordersAutoRefresh";
const AUTO_REFRESH_INTERVAL_MS = 30_000;

export default function Orders() {
    const tenantId = useTenantId();
    const { showToast } = useToast();

    // Activity selection
    const [activities, setActivities] = useState<V2Activity[]>([]);
    const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);

    // Data
    const [orders, setOrders] = useState<V2OrderWithItems[]>([]);
    const [tables, setTables] = useState<V2Table[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>("all");
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Auto-refresh
    const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(
        () => localStorage.getItem(AUTO_REFRESH_STORAGE_KEY) === "true"
    );

    // ── Activities load ──
    const loadActivities = useCallback(async () => {
        if (!tenantId) return;
        try {
            const data = await getActivities(tenantId);
            setActivities(data);
            setSelectedActivityId(prev =>
                prev ?? (data.length > 0 ? data[0].id : null)
            );
        } catch {
            showToast({ message: "Impossibile caricare le sedi", type: "error" });
        }
    }, [tenantId, showToast]);

    useEffect(() => {
        loadActivities();
    }, [loadActivities]);

    // ── Tables load (per lookup label/zone) ──
    const loadTables = useCallback(async () => {
        if (!tenantId || !selectedActivityId) {
            setTables([]);
            return;
        }
        try {
            const data = await listTables(tenantId, selectedActivityId);
            setTables(data);
        } catch {
            // Silenzioso: lookup ottimizzazione, fallback "?" lato render
        }
    }, [tenantId, selectedActivityId]);

    useEffect(() => {
        loadTables();
    }, [loadTables]);

    // ── Orders load ──
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
        loadOrders();
    }, [loadOrders]);

    // ── Auto-refresh effect ──
    useEffect(() => {
        if (!autoRefreshEnabled) return;
        const id = setInterval(() => {
            loadOrders();
        }, AUTO_REFRESH_INTERVAL_MS);
        return () => clearInterval(id);
    }, [autoRefreshEnabled, loadOrders]);

    useEffect(() => {
        localStorage.setItem(AUTO_REFRESH_STORAGE_KEY, String(autoRefreshEnabled));
    }, [autoRefreshEnabled]);

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

    // ── Transition handlers + optimistic lock handling ──
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
        } catch (err) {
            handleTransitionError(err, order, "la consegna");
        }
    }

    // ── Placeholder handlers (drawer cancel/rectify/detail in prompt #2 e #3) ──
    function handleCancelOpen(_order: V2OrderWithItems) {
        showToast({ message: "Cancellazione disponibile a breve", type: "info" });
    }
    function handleRectifyOpen(_order: V2OrderWithItems) {
        showToast({ message: "Rettifica disponibile a breve", type: "info" });
    }
    function handleViewDetail(_order: V2OrderWithItems) {
        showToast({ message: "Dettaglio disponibile a breve", type: "info" });
    }

    return (
        <section className={styles.container}>
            <PageHeader
                title="Ordini"
                subtitle="Dashboard live degli ordini in corso."
                actions={
                    <div className={styles.headerActions}>
                        <Button
                            variant="secondary"
                            leftIcon={<RefreshCw size={16} />}
                            onClick={loadOrders}
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
                }
            />

            {activities.length > 1 && (
                <div className={styles.activitySelector}>
                    <label htmlFor="activity-select" className={styles.activitySelectorLabel}>
                        Sede:
                    </label>
                    <select
                        id="activity-select"
                        className={styles.activitySelect}
                        value={selectedActivityId ?? ""}
                        onChange={e => setSelectedActivityId(e.target.value || null)}
                    >
                        {activities.map(a => (
                            <option key={a.id} value={a.id}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

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
                    title={orders.length === 0 ? "Nessun ordine" : "Nessun risultato"}
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
                                tableZone={table?.zone ?? null}
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
        </section>
    );
}
