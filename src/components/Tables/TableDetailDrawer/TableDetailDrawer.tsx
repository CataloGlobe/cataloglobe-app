import { useCallback, useEffect, useState } from "react";
import { Clock, BellRing } from "lucide-react";

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
    clearBillRequestsForTable
} from "@/services/supabase/tables";
import {
    listActiveSessionsForTable,
    getOpenOrderGroupForTable
} from "@/services/supabase/customerSessions";
import { listOrdersForActivity } from "@/services/supabase/orders";
import type {
    V2Table,
    V2CustomerSession,
    V2OrderGroup,
    V2OrderWithItems,
    OrderStatus
} from "@/types/orders";

import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";

import styles from "./TableDetailDrawer.module.scss";

interface Props {
    open: boolean;
    tenantId: string | null;
    activityId: string | null;
    tableId: string | null;
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

const TABLE_HISTORY_STATUSES: OrderStatus[] = [
    "submitted",
    "acknowledged",
    "ready",
    "delivered"
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
            return { variant: "warning", label: "Inviato" };
        case "acknowledged":
            return { variant: "success", label: "In corso" };
        case "ready":
            return { variant: "success", label: "Pronto" };
        case "delivered":
            return { variant: "neutral", label: "Consegnato" };
        case "cancelled":
            return { variant: "neutral", label: "Annullato" };
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
    onClose,
    onRequestClose,
    onMaintenanceChanged,
    onBillCleared
}: Props) {
    const [data, setData] = useState<DetailData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
    const [isClearingBill, setIsClearingBill] = useState(false);

    const { showToast } = useToast();
    const { permissions } = usePermissions();
    // Gate `tables.manage` sull'activity corrente (viewer escluso). Usato
    // sia per il bottone "Chiudi tavolo" nel footer sia per il toggle
    // manutenzione nello statusBlock: entrambe sono azioni di scope
    // operazione tavolo.
    const canManageTable =
        !!activityId &&
        !!permissions &&
        canDoOnActivity(permissions, "tables.manage", activityId);
    // Bottone "Chiudi tavolo" mostrato solo se:
    // - il parent fornisce il callback (TablesLiveView lo passa, altri
    //   consumer informativi possono ometterlo),
    // - canManageTable,
    // - c'e' effettivamente qualcosa da chiudere (gate definito sotto su
    //   `nothingToClose` derivato dai dati gia' fetchati).
    const hasClosePermission = canManageTable && !!onRequestClose;

    const loadDetail = useCallback(async () => {
        if (!tenantId || !activityId || !tableId) return;
        setIsLoading(true);
        setError(null);
        try {
            // Tavolo + sessione attiva + open group in parallelo.
            const [table, sessions, openGroup] = await Promise.all([
                getTable(tableId, tenantId),
                listActiveSessionsForTable(tenantId, tableId),
                getOpenOrderGroupForTable(tenantId, tableId)
            ]);
            // Ordini del tavolo: ultimi 50 non-cancelled (snapshot).
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
            // Patch locale on-success: aggiorna badge + Switch senza
            // attendere refetch (zero flicker). Non e' ottimistica: solo
            // se la write passa.
            setData(d =>
                d ? { ...d, table: { ...d.table, maintenance_mode: updated.maintenance_mode } } : d
            );
            showToast({
                message: next
                    ? "Tavolo messo in manutenzione"
                    : "Tavolo riattivato",
                type: "success"
            });
            onMaintenanceChanged?.(tableId);
        } catch {
            showToast({
                message: "Errore durante l'aggiornamento della manutenzione",
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
            // Patch locale: tutte le sessions del tavolo perdono il flag.
            // Realtime arrivera' comunque, ma il patch evita flicker del
            // badge "Conto richiesto" per-session in lista.
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

    // Carica al primo open su un tavolo specifico (e re-carica se cambiano i target).
    useEffect(() => {
        if (!open || !tableId) {
            setData(null);
            setError(null);
            return;
        }
        void loadDetail();
    }, [open, tableId, loadDetail]);

    const activeOrders = data
        ? data.orders.filter(o =>
              o.status === "submitted" ||
              o.status === "acknowledged" ||
              o.status === "ready"
          )
        : [];
    const deliveredOrders = data
        ? data.orders.filter(o => o.status === "delivered")
        : [];

    // "Niente da chiudere" = nessun item che la chiusura tavolo
    // toccherebbe (no sessioni attive, no order_group aperto, no ordini
    // non terminali). Su un tavolo cosi' il bottone "Chiudi tavolo" non
    // viene mostrato — il drawer resta solo informativo.
    const nothingToClose =
        !!data &&
        data.sessions.length === 0 &&
        data.openGroup === null &&
        activeOrders.length === 0;

    const tableLabel = data?.table.label ?? "Tavolo";
    const zoneName = data?.table.zone_name ?? null;

    return (
        <SystemDrawer open={open} onClose={onClose} width={560}>
            <DrawerLayout
                header={
                    <Text variant="title-sm" weight={600}>
                        {tableLabel}
                        {zoneName ? ` · ${zoneName}` : ""}
                    </Text>
                }
                footer={
                    hasClosePermission && !nothingToClose && tableId ? (
                        <div className={styles.footerActions}>
                            <Button variant="secondary" onClick={onClose}>
                                Chiudi
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => onRequestClose!(tableId)}
                            >
                                Chiudi tavolo
                            </Button>
                        </div>
                    ) : (
                        <Button variant="secondary" onClick={onClose}>
                            Chiudi
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
                        <div className={styles.statusBlock}>
                            {data.table.maintenance_mode ? (
                                <StatusBadge variant="warning" label="Manutenzione" />
                            ) : data.sessions.length > 0 ? (
                                <StatusBadge variant="success" label="Occupato" />
                            ) : (
                                <StatusBadge variant="neutral" label="Libero" />
                            )}
                            {data.table.seats != null && (
                                <Text variant="body-sm" colorVariant="muted">
                                    {data.table.seats}{" "}
                                    {data.table.seats === 1 ? "posto" : "posti"}
                                </Text>
                            )}
                        </div>

                        {canManageTable && (
                            <div className={styles.maintenanceRow}>
                                <div className={styles.maintenanceCopy}>
                                    <Text weight={500}>Manutenzione</Text>
                                    <Text variant="body-sm" colorVariant="muted">
                                        I clienti non possono ordinare da questo tavolo
                                        finché disattivi questa opzione.
                                    </Text>
                                </div>
                                <Switch
                                    checked={data.table.maintenance_mode}
                                    onChange={next => void handleMaintenanceToggle(next)}
                                    disabled={isTogglingMaintenance}
                                />
                            </div>
                        )}

                        {canManageTable &&
                            data.sessions.some(s => s.bill_requested_at) && (
                                <div className={styles.billRequestRow}>
                                    <div className={styles.billRequestCopy}>
                                        <Text weight={500}>Conto richiesto</Text>
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

                        <section className={styles.section}>
                            <Text variant="body-sm" weight={600} colorVariant="muted">
                                Sessioni attive
                            </Text>
                            {data.sessions.length === 0 ? (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessuna sessione attiva.
                                </Text>
                            ) : (
                                <ul className={styles.sessionsList}>
                                    {data.sessions.map(s => (
                                        <li key={s.id} className={styles.sessionRow}>
                                            <div className={styles.sessionMain}>
                                                <Text weight={500}>
                                                    {s.customer_name ?? "Senza nome"}
                                                </Text>
                                                <div className={styles.sessionTime}>
                                                    <Clock size={14} />
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="muted"
                                                    >
                                                        Aperta da{" "}
                                                        {formatElapsedMinutes(
                                                            s.first_seen_at
                                                        )}{" "}
                                                        ({formatAbsolute(s.first_seen_at)})
                                                    </Text>
                                                </div>
                                            </div>
                                            {s.bill_requested_at && (
                                                <StatusBadge
                                                    variant="warning"
                                                    label="Conto richiesto"
                                                />
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        <section className={styles.section}>
                            <Text variant="body-sm" weight={600} colorVariant="muted">
                                Order group aperto
                            </Text>
                            {data.openGroup ? (
                                <Text variant="body-sm">
                                    Gruppo #{data.openGroup.id.slice(0, 6)} · aperto da{" "}
                                    {formatElapsedMinutes(data.openGroup.created_at)}
                                </Text>
                            ) : (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun gruppo aperto.
                                </Text>
                            )}
                        </section>

                        <section className={styles.section}>
                            <Text variant="body-sm" weight={600} colorVariant="muted">
                                Ordini attivi ({activeOrders.length})
                            </Text>
                            {activeOrders.length === 0 ? (
                                <Text variant="body-sm" colorVariant="muted">
                                    Nessun ordine in corso.
                                </Text>
                            ) : (
                                <ul className={styles.ordersList}>
                                    {activeOrders.map(o => {
                                        const { variant, label } = orderStatusInfo(o.status);
                                        return (
                                            <li key={o.id} className={styles.orderRow}>
                                                <StatusBadge
                                                    variant={variant}
                                                    label={label}
                                                />
                                                <div className={styles.orderMeta}>
                                                    <Text variant="body-sm">
                                                        Inviato{" "}
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
                                                <Text weight={500}>
                                                    {formatEur(o.total_amount)}
                                                </Text>
                                            </li>
                                        );
                                    })}
                                </ul>
                            )}
                        </section>

                        {deliveredOrders.length > 0 && (
                            <section className={styles.section}>
                                <Text
                                    variant="body-sm"
                                    weight={600}
                                    colorVariant="muted"
                                >
                                    Ordini serviti ({deliveredOrders.length})
                                </Text>
                                <ul className={styles.ordersList}>
                                    {deliveredOrders.map(o => (
                                        <li key={o.id} className={styles.orderRow}>
                                            <StatusBadge
                                                variant="neutral"
                                                label="Consegnato"
                                            />
                                            <div className={styles.orderMeta}>
                                                <Text variant="body-sm">
                                                    {o.delivered_at
                                                        ? `Consegnato ${formatAbsolute(o.delivered_at)}`
                                                        : `Inviato ${formatAbsolute(o.submitted_at)}`}
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
                                            <Text weight={500}>
                                                {formatEur(o.total_amount)}
                                            </Text>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </div>
                ) : null}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default TableDetailDrawer;
