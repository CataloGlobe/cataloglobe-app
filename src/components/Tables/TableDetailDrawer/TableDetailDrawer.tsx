import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Clock, ConciergeBell, Receipt, RotateCcw, X } from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Switch } from "@/components/ui/Switch/Switch";
import type { StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";

import { useToast } from "@/context/Toast/ToastContext";

import {
    getTable,
    updateTable,
    clearBillRequestsForTable,
    clearWaiterCallsForTable
} from "@/services/supabase/tables";
import {
    listActiveSessionsForTable,
    getOpenOrderGroupForTable
} from "@/services/supabase/customerSessions";
import { acknowledgeOrder, listOrdersForActivity } from "@/services/supabase/orders";
import type {
    V2Table,
    V2CustomerSession,
    V2OrderGroup,
    V2OrderWithItems,
    OrderStatus
} from "@/types/orders";

import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";

import { deriveTableStatus, type TableStatus } from "@/utils/tableState";

import styles from "./TableDetailDrawer.module.scss";

interface Props {
    open: boolean;
    tenantId: string | null;
    activityId: string | null;
    tableId: string | null;
    /**
     * Netto "Da pagare" del tavolo = `current_total` della riga
     * `V2TableWithState` (view, già al netto degli storni). Passato dal
     * parent (`TablesLiveView`) che ha la riga in mano — il drawer NON
     * fa fetch della view. `null` = dato non disponibile → blocco netto
     * nascosto (no `NaN`/`0` fuorviante).
     */
    currentTotal: number | null;
    onClose: () => void;
    /**
     * Richiesta di apertura "Chiudi tavolo" dal detail. Il parent
     * (TablesLiveView) si occupa di:
     *   1. chiudere il detail drawer,
     *   2. attendere la durata dell'exit anim,
     *   3. aprire il TableCloseDrawer con la riga V2TableWithState
     *      letta da items[] (zero I/O extra).
     * Bottone gated da canDoOnActivity(perms, 'tables.manage', activityId);
     * se omesso o se l'utente non ha il permesso il bottone non viene
     * renderizzato.
     */
    onRequestClose?: (tableId: string) => void;
    /**
     * Notifica al parent che il flag manutenzione del tavolo e' stato
     * toggleato. Il parent dovrebbe rifare il fetch della lista (es.
     * `useTablesLiveRealtime.refetch`) per sincronizzare card, filtri e
     * KPI. `tables` non e' in publication `supabase_realtime`, quindi
     * il toggle non propaga via realtime ad altri client — refetch
     * locale solo per il client che esegue il toggle.
     */
    onMaintenanceChanged?: (tableId: string) => void;
    /**
     * Notifica al parent che la richiesta di conto del tavolo e' stata
     * gestita (table-level clear). Il parent dovrebbe rifare il fetch della
     * lista (es. `useTablesLiveRealtime.refetch`) per sincronizzare card,
     * filtri e KPI; il realtime via customer_sessions tipicamente arriva
     * comunque, refetch e' solo allineamento immediato.
     */
    onBillCleared?: (tableId: string) => void;
    onWaiterCleared?: (tableId: string) => void;
}

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
});

const RECENT_ORDERS_CAP = 5;

const TABLE_HISTORY_STATUSES: OrderStatus[] = [
    "submitted",
    "acknowledged",
    "ready",
    "delivered",
    "cancelled"
];

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

function formatAbsolute(iso: string): string {
    return DATETIME_FORMATTER.format(new Date(iso));
}

function formatElapsedMinutes(fromIso: string): string {
    const ms = Date.now() - new Date(fromIso).getTime();
    if (ms < 0) return "in corso";
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 1) return "meno di 1 min";
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

function orderStatusInfo(status: OrderStatus): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "submitted":
            return { variant: "warning", label: "Da confermare" };
        case "acknowledged":
            return { variant: "warning", label: "In preparazione" };
        case "ready":
            return { variant: "success", label: "Pronto" };
        case "delivered":
            return { variant: "neutral", label: "Servito" };
        case "cancelled":
            return { variant: "neutral", label: "Annullato" };
    }
}

function tableStatusInfo(status: TableStatus): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "maintenance":
            return { variant: "warning", label: "Manutenzione" };
        case "occupied":
            return { variant: "success", label: "Occupato" };
        default:
            return { variant: "neutral", label: "Libero" };
    }
}

interface DetailData {
    table: V2Table;
    sessions: V2CustomerSession[];
    openGroup: V2OrderGroup | null;
    orders: V2OrderWithItems[];
}

export function TableDetailDrawer({
    open,
    tenantId,
    activityId,
    tableId,
    currentTotal,
    onClose,
    onRequestClose,
    onMaintenanceChanged,
    onBillCleared,
    onWaiterCleared
}: Props) {
    const [data, setData] = useState<DetailData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
    const [isClearingBill, setIsClearingBill] = useState(false);
    const [isClearingWaiter, setIsClearingWaiter] = useState(false);
    const [showAllRecent, setShowAllRecent] = useState(false);
    const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const canManageTable =
        !!activityId &&
        !!permissions &&
        canDoOnActivity(permissions, "tables.manage", activityId);
    const hasClosePermission = canManageTable && !!onRequestClose;

    const loadDetail = useCallback(async () => {
        if (!tenantId || !activityId || !tableId) return;
        setIsLoading(true);
        setError(null);
        try {
            const [table, sessions, openGroup] = await Promise.all([
                getTable(tableId, tenantId),
                listActiveSessionsForTable(tenantId, tableId),
                getOpenOrderGroupForTable(tenantId, tableId)
            ]);
            const orders = await listOrdersForActivity(tenantId, activityId, {
                tableId,
                status: TABLE_HISTORY_STATUSES,
                includeItems: false,
                limit: 50
            });
            setData({ table, sessions, openGroup, orders });
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore caricamento dettaglio");
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId, tableId]);

    async function handleMaintenanceToggle(next: boolean): Promise<void> {
        if (!tenantId || !tableId || !data) return;
        setIsTogglingMaintenance(true);
        try {
            const updated = await updateTable(tableId, tenantId, {
                maintenance_mode: next
            });
            setData(d =>
                d ? { ...d, table: { ...d.table, maintenance_mode: updated.maintenance_mode } } : d
            );
            showToast({
                message: next ? "Tavolo messo fuori servizio" : "Tavolo riattivato",
                type: "success"
            });
            onMaintenanceChanged?.(tableId);
        } catch {
            showToast({
                message: "Errore durante l'aggiornamento",
                type: "error"
            });
        } finally {
            setIsTogglingMaintenance(false);
        }
    }

    async function handleClearBill(): Promise<void> {
        if (!tenantId || !tableId || !data) return;
        setIsClearingBill(true);
        try {
            await clearBillRequestsForTable(tableId, tenantId);
            setData(d =>
                d
                    ? {
                          ...d,
                          sessions: d.sessions.map(s => ({
                              ...s,
                              bill_requested_at: null
                          }))
                      }
                    : d
            );
            showToast({ message: "Conto gestito", type: "success" });
            onBillCleared?.(tableId);
        } catch {
            showToast({
                message: "Errore durante l'aggiornamento della richiesta conto",
                type: "error"
            });
        } finally {
            setIsClearingBill(false);
        }
    }

    async function handleClearWaiter(): Promise<void> {
        if (!tenantId || !tableId || !data) return;
        setIsClearingWaiter(true);
        try {
            await clearWaiterCallsForTable(tableId, tenantId);
            setData(d =>
                d
                    ? {
                          ...d,
                          sessions: d.sessions.map(s => ({
                              ...s,
                              waiter_called_at: null
                          }))
                      }
                    : d
            );
            showToast({ message: "Cameriere gestito", type: "success" });
            onWaiterCleared?.(tableId);
        } catch {
            showToast({
                message: "Errore durante l'aggiornamento della chiamata cameriere",
                type: "error"
            });
        } finally {
            setIsClearingWaiter(false);
        }
    }

    async function handleConfirmOrder(orderId: string, version: number): Promise<void> {
        setConfirmingOrderId(orderId);
        try {
            await acknowledgeOrder(orderId, version);
            showToast({ message: "Ordine confermato", type: "success" });
            await loadDetail();
        } catch {
            showToast({ message: "Errore durante la conferma dell'ordine", type: "error" });
        } finally {
            setConfirmingOrderId(null);
        }
    }

    useEffect(() => {
        if (!open || !tableId) {
            setData(null);
            setError(null);
            setShowAllRecent(false);
            return;
        }
        void loadDetail();
    }, [open, tableId, loadDetail]);

    const activeOrders = data
        ? data.orders.filter(o =>
              o.status === "submitted" || o.status === "acknowledged" || o.status === "ready"
          )
        : [];

    // Scope "Ordini del conto" al conto vivo (openGroup.id), non a tutta la storia
    // del tavolo: i gruppi chiusi e gli eventuali gruppi open stale (es. mai chiusi
    // il giorno prima) restano fuori. openGroup === null (tavolo libero) → lista vuota.
    const recentOrders = data
        ? data.orders.filter(
              o =>
                  (o.status === "delivered" || o.status === "cancelled") &&
                  o.order_group_id === data.openGroup?.id
          )
        : [];

    // openGroup is NOT rendered but kept for nothingToClose + deriveTableStatus.
    const nothingToClose =
        !!data &&
        data.sessions.length === 0 &&
        data.openGroup === null &&
        activeOrders.length === 0;

    const status: TableStatus = data
        ? deriveTableStatus({
              maintenance_mode: data.table.maintenance_mode,
              active_sessions_count: data.sessions.length,
              open_orders_count: activeOrders.length,
              open_groups_count: data.openGroup ? 1 : 0
          })
        : "free";

    const isOccupied = status === "occupied";
    const firstSeenAt = data?.sessions[0]?.first_seen_at ?? null;
    const { variant: statusVariant, label: statusLabel } = tableStatusInfo(status);

    const activeTotal = activeOrders.reduce((sum, o) => sum + o.total_amount, 0);

    const tableLabel = data?.table.label ?? "Tavolo";
    const zoneName = data?.table.zone_name ?? null;

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <div className={styles.drawerHeaderBlock}>
                        <div className={styles.drawerHeaderInfo}>
                            <Text variant="title-sm" weight={600}>
                                {tableLabel}
                                {zoneName ? ` · ${zoneName}` : ""}
                            </Text>
                            {data && (
                                <div className={styles.drawerHeaderMeta}>
                                    <StatusBadge variant={statusVariant} label={statusLabel} />
                                    {data.table.seats != null && (
                                        <Text variant="body-sm" colorVariant="muted">
                                            {data.table.seats}{" "}
                                            {data.table.seats === 1 ? "posto" : "posti"}
                                        </Text>
                                    )}
                                    {isOccupied && firstSeenAt && (
                                        <div className={styles.elapsedRow}>
                                            <Clock size={13} />
                                            <Text variant="body-sm" colorVariant="muted">
                                                da {formatElapsedMinutes(firstSeenAt)}
                                            </Text>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <button
                            className={styles.dismissButton}
                            onClick={onClose}
                            aria-label="Chiudi"
                        >
                            <X size={18} />
                        </button>
                    </div>
                }
                footer={
                    hasClosePermission && !nothingToClose && tableId ? (
                        <Button variant="primary" onClick={() => onRequestClose!(tableId)}>
                            Chiudi tavolo
                        </Button>
                    ) : (
                        <Button variant="secondary" onClick={onClose}>
                            Fatto
                        </Button>
                    )
                }
            >
                {isLoading && !data ? (
                    <div className={styles.loading}>
                        <Text colorVariant="muted">Caricamento...</Text>
                    </div>
                ) : error ? (
                    <EmptyState
                        icon={<BellRing size={40} strokeWidth={1.5} />}
                        title="Errore"
                        description={error}
                        action={
                            <Button variant="secondary" onClick={() => void loadDetail()}>
                                Riprova
                            </Button>
                        }
                    />
                ) : data ? (
                    <div className={styles.content}>
                        {canManageTable && data.sessions.some(s => s.bill_requested_at) && (
                            <div className={styles.billRequestRow}>
                                <div className={styles.billRequestCopy}>
                                    <div className={styles.billRequestTitle}>
                                        <Receipt size={15} />
                                        <Text weight={500}>Conto richiesto</Text>
                                    </div>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Il tavolo ha chiesto il conto.
                                    </Text>
                                </div>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => void handleClearBill()}
                                    loading={isClearingBill}
                                >
                                    Segna conto portato
                                </Button>
                            </div>
                        )}

                        {canManageTable && data.sessions.some(s => s.waiter_called_at) && (
                            <div className={styles.waiterCallRow}>
                                <div className={styles.waiterCallCopy}>
                                    <div className={styles.waiterCallTitle}>
                                        <ConciergeBell size={15} />
                                        <Text weight={500}>Cameriere chiamato</Text>
                                    </div>
                                    <Text variant="body-sm" colorVariant="muted">
                                        Il tavolo ha chiamato il cameriere.
                                    </Text>
                                </div>
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={() => void handleClearWaiter()}
                                    loading={isClearingWaiter}
                                >
                                    Segna cameriere arrivato
                                </Button>
                            </div>
                        )}

                        {canManageTable && (
                            <div className={styles.maintenanceRow}>
                                <div className={styles.maintenanceCopy}>
                                    <Text weight={500}>Fuori servizio</Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        {isOccupied
                                            ? "Chiudi prima il tavolo per metterlo fuori servizio."
                                            : "I clienti non potranno ordinare da questo tavolo finché questa opzione è attiva."}
                                    </Text>
                                </div>
                                <span className={styles.maintenanceToggle}>
                                    <Switch
                                        checked={data.table.maintenance_mode}
                                        onChange={next => void handleMaintenanceToggle(next)}
                                        disabled={isOccupied || isTogglingMaintenance}
                                    />
                                </span>
                            </div>
                        )}

                        {isOccupied && (
                            <section className={styles.section}>
                                <Text variant="body-sm" weight={600} colorVariant="muted">
                                    Ordini in corso ({activeOrders.length})
                                </Text>
                                {activeOrders.length === 0 ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Sessione aperta, nessun ordine ancora.
                                    </Text>
                                ) : (
                                    <>
                                        <ul className={styles.ordersList}>
                                            {activeOrders.map(o => {
                                                const { variant, label } = orderStatusInfo(o.status);
                                                const isPending = o.status === "submitted";
                                                return (
                                                    <li
                                                        key={o.id}
                                                        className={`${styles.orderRow}${isPending ? ` ${styles.orderRowPending}` : ""}`}
                                                    >
                                                        <StatusBadge variant={variant} label={label} />
                                                        <div className={styles.orderMeta}>
                                                            <Text variant="body-sm">
                                                                {formatAbsolute(o.submitted_at)}
                                                            </Text>
                                                            {o.customer_name_snapshot && (
                                                                <Text
                                                                    variant="body-sm"
                                                                    colorVariant="muted"
                                                                >
                                                                    {o.customer_name_snapshot}
                                                                </Text>
                                                            )}
                                                        </div>
                                                        {isPending ? (
                                                            <div className={styles.orderActions}>
                                                                <Text weight={500}>
                                                                    {formatEur(o.total_amount)}
                                                                </Text>
                                                                <Button
                                                                    variant="primary"
                                                                    size="sm"
                                                                    loading={
                                                                        confirmingOrderId ===
                                                                        o.id
                                                                    }
                                                                    disabled={
                                                                        confirmingOrderId !== null
                                                                    }
                                                                    onClick={() =>
                                                                        void handleConfirmOrder(
                                                                            o.id,
                                                                            o.version
                                                                        )
                                                                    }
                                                                >
                                                                    <Check size={12} aria-hidden />
                                                                    Conferma
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Text weight={500}>
                                                                {formatEur(o.total_amount)}
                                                            </Text>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <div className={styles.activeTotalRow}>
                                            <Text variant="body-sm" weight={600}>
                                                Totale in corso
                                            </Text>
                                            <Text weight={600}>{formatEur(activeTotal)}</Text>
                                        </div>
                                    </>
                                )}
                            </section>
                        )}

                        {recentOrders.length > 0 && (
                            <section className={styles.section}>
                                <Text variant="body-sm" weight={600} colorVariant="muted">
                                    Ordini del conto
                                </Text>
                                <>
                                    <ul className={styles.ordersList}>
                                        {(showAllRecent
                                            ? recentOrders
                                            : recentOrders.slice(0, RECENT_ORDERS_CAP)
                                        ).map(o => {
                                            const timestamp =
                                                o.status === "delivered" && o.delivered_at
                                                    ? formatAbsolute(o.delivered_at)
                                                    : formatAbsolute(o.submitted_at);

                                            // Storno = contro-ordine (is_rectification):
                                            // badge "Storno" rosa, importo negativo in rosso,
                                            // motivo da `notes` (RPC rectify_order_atomic.p_notes).
                                            if (o.is_rectification) {
                                                return (
                                                    <li
                                                        key={o.id}
                                                        className={`${styles.orderRow} ${styles.orderRowStorno}`}
                                                    >
                                                        <span className={styles.stornoBadge}>
                                                            <RotateCcw size={11} aria-hidden />
                                                            Storno
                                                        </span>
                                                        <div className={styles.orderMeta}>
                                                            <Text variant="body-sm">
                                                                {timestamp}
                                                            </Text>
                                                            {o.notes && (
                                                                <Text
                                                                    variant="body-sm"
                                                                    colorVariant="muted"
                                                                >
                                                                    {o.notes}
                                                                </Text>
                                                            )}
                                                        </div>
                                                        <span className={styles.stornoAmount}>
                                                            {formatEur(-o.total_amount)}
                                                        </span>
                                                    </li>
                                                );
                                            }

                                            const { variant, label } = orderStatusInfo(o.status);
                                            return (
                                                <li key={o.id} className={styles.orderRow}>
                                                    <StatusBadge variant={variant} label={label} />
                                                    <div className={styles.orderMeta}>
                                                        <Text variant="body-sm">{timestamp}</Text>
                                                        {o.customer_name_snapshot && (
                                                            <Text
                                                                variant="body-sm"
                                                                colorVariant="muted"
                                                            >
                                                                {o.customer_name_snapshot}
                                                            </Text>
                                                        )}
                                                    </div>
                                                    <Text weight={500}>
                                                        {formatEur(o.total_amount)}
                                                    </Text>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                    {!showAllRecent &&
                                        recentOrders.length > RECENT_ORDERS_CAP && (
                                            <button
                                                className={styles.showAllButton}
                                                onClick={() => setShowAllRecent(true)}
                                            >
                                                Mostra tutti (
                                                {recentOrders.length - RECENT_ORDERS_CAP} in
                                                più)
                                            </button>
                                        )}
                                    {currentTotal != null && (
                                        <div className={styles.netTotalRow}>
                                            <div className={styles.netTotalCopy}>
                                                <Text weight={600}>Da pagare</Text>
                                                {recentOrders.some(o => o.is_rectification) && (
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="muted"
                                                    >
                                                        storni già scalati
                                                    </Text>
                                                )}
                                            </div>
                                            <Text variant="title-sm" weight={700}>
                                                {formatEur(currentTotal)}
                                            </Text>
                                        </div>
                                    )}
                                </>
                            </section>
                        )}
                    </div>
                ) : null}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default TableDetailDrawer;
