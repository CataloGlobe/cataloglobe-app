import { Fragment, useCallback, useEffect, useId, useState } from "react";
import {
    Check,
    Clock,
    ConciergeBell,
    CornerDownRight,
    Receipt,
    RotateCcw,
    Wrench
} from "lucide-react";

import { SystemDrawer } from "@/components/layout/SystemDrawer/SystemDrawer";
import { DrawerLayout } from "@/components/layout/SystemDrawer/DrawerLayout";
import { Button } from "@/components/ui/Button/Button";
import Text from "@/components/ui/Text/Text";
import { Card } from "@/components/ui/Card/Card";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
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
import {
    acknowledgeOrder,
    listOrdersForActivity,
    getOrderWithItems,
    listRectifiableResiduals,
    rectifyOrder
} from "@/services/supabase/orders";
import { orderStatusBadge } from "@/pages/Dashboard/Orders/orderStatusBadge";
import OrderRectifyForm, {
    type RectifyFormState
} from "@/pages/Dashboard/Orders/OrderRectifyForm";
import type {
    V2Table,
    V2CustomerSession,
    V2OrderGroup,
    V2OrderWithItems,
    V2RectifiableResidual,
    OrderStatus,
    RectifyOrderItem
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
     * Notifica al parent che il flag «fuori servizio» (maintenance_mode) del tavolo e' stato
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
    /**
     * Notifica al parent che è stato creato uno storno dal conto. Il parent
     * deve rifare il fetch della sorgente di `current_total` (es.
     * `useTablesLiveRealtime.refetch`) per aggiornare "Da pagare" subito —
     * il realtime su `orders` arriverebbe comunque ma con debounce.
     */
    onStornoCreated?: (tableId: string) => void;
}

type DrawerView = "conto" | "storna";

/**
 * Mappa l'errore di `rectifyOrder` a un messaggio toast italiano.
 */
function mapStornoError(err: unknown): string {
    if (err instanceof Error) {
        const details = (err as Error & { details?: { reason?: string } }).details;
        if (
            err.message === "INVALID_RECTIFICATION_ITEMS" &&
            details?.reason === "STORNO_QTY_EXCEEDS_RESIDUAL"
        ) {
            return "Quantità superiore al residuo stornabile per questo articolo.";
        }
        if (err.message === "INVALID_PARENT_STATE") {
            return "Solo gli ordini serviti possono essere stornati.";
        }
        if (
            err.message === "EMPTY_RECTIFICATION" ||
            err.message === "INVALID_RECTIFICATION_QUANTITY"
        ) {
            return "Seleziona almeno un articolo da stornare.";
        }
    }
    return "Errore durante lo storno. Riprova.";
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

function tableStatusInfo(status: TableStatus): {
    variant: StatusBadgeVariant;
    label: string;
} {
    switch (status) {
        case "maintenance":
            return { variant: "warning", label: "Fuori servizio" };
        case "occupied":
            return { variant: "success", label: "Aperto" };
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

/**
 * Unità di render del conto raggruppato:
 *   - `order`  = una comanda (delivered|cancelled) coi suoi storni agganciati
 *                e il netto per ordine (lordo − Σ storni);
 *   - `orphan` = uno storno il cui padre non è nel conto → riga standalone.
 */
type ContoUnit =
    | { kind: "order"; order: V2OrderWithItems; storni: V2OrderWithItems[]; netto: number }
    | { kind: "orphan"; storno: V2OrderWithItems };

/**
 * Riga di uno storno, subito sotto la comanda a cui è agganciato (o da sola se
 * il padre non è nel conto). Gli articoli non ci sono: il conto carica gli
 * ordini senza items (`includeItems:false`); il motivo (`notes`) sì.
 */
function renderStornoRow(s: V2OrderWithItems) {
    return (
        <ListRow
            key={s.id}
            leading={<CornerDownRight size={16} aria-hidden />}
            title={
                <span className={styles.stornoTitle}>
                    <RotateCcw size={12} aria-hidden /> Storno
                </span>
            }
            subtitle={s.notes || undefined}
            wrapSubtitle="full"
            metaInline
            meta={<Text variant="body-sm" weight={500}>{formatEur(-s.total_amount)}</Text>}
        />
    );
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
    onWaiterCleared,
    onStornoCreated
}: Props) {
    const [data, setData] = useState<DetailData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isTogglingMaintenance, setIsTogglingMaintenance] = useState(false);
    const [isClearingBill, setIsClearingBill] = useState(false);
    const [isClearingWaiter, setIsClearingWaiter] = useState(false);
    const [showAllRecent, setShowAllRecent] = useState(false);
    const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);

    // ── Vista interna "storna" (B2: niente secondo drawer) ──
    const [view, setView] = useState<DrawerView>("conto");
    const [stornaOrder, setStornaOrder] = useState<V2OrderWithItems | null>(null);
    // Residui stornabili dell'ordine in storno. `null` = residui non disponibili
    // (fetch fallito) → il form ripiega su qty servita; la RPC resta la difesa
    // finale sul cap cumulativo.
    const [stornaResiduals, setStornaResiduals] = useState<
        V2RectifiableResidual[] | null
    >(null);
    const [stornaLoadingOrderId, setStornaLoadingOrderId] = useState<string | null>(null);
    const [stornaState, setStornaState] = useState<RectifyFormState>({
        estimate: 0,
        canConfirm: false
    });
    const [isSavingStorno, setIsSavingStorno] = useState(false);

    const { showToast } = useToast();
    const { permissions } = usePermissions();
    const titleId = useId();
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

    async function handleOpenStorna(order: V2OrderWithItems): Promise<void> {
        if (!tenantId) return;
        setStornaLoadingOrderId(order.id);
        try {
            const full = await getOrderWithItems(order.id, tenantId);
            // Residui in fetch separato: il loro fallimento NON deve bloccare lo
            // storno. Fallback meno rischioso = si prosegue con qty servita (il
            // form ripiega su `residuals=null`) e la RPC valida il cap reale.
            let residuals: V2RectifiableResidual[] | null = null;
            try {
                residuals = await listRectifiableResiduals(order.id, tenantId);
            } catch {
                showToast({
                    message:
                        "Impossibile calcolare il residuo stornabile: verranno usate le quantità servite.",
                    type: "warning"
                });
            }
            setStornaOrder(full);
            setStornaResiduals(residuals);
            setStornaState({ estimate: 0, canConfirm: false });
            setView("storna");
        } catch {
            showToast({
                message: "Errore nel caricamento dell'ordine. Riprova.",
                type: "error"
            });
        } finally {
            setStornaLoadingOrderId(null);
        }
    }

    function handleBackToConto(): void {
        setView("conto");
        setStornaOrder(null);
        setStornaResiduals(null);
        setStornaState({ estimate: 0, canConfirm: false });
    }

    async function handleConfirmStorno(
        items: RectifyOrderItem[],
        reason: string
    ): Promise<void> {
        if (!stornaOrder) return;
        setIsSavingStorno(true);
        try {
            await rectifyOrder(stornaOrder.id, items, reason || undefined);
            showToast({ message: "Storno registrato", type: "success" });
            setView("conto");
            setStornaOrder(null);
            setStornaResiduals(null);
            setStornaState({ estimate: 0, canConfirm: false });
            await loadDetail();
            if (tableId) onStornoCreated?.(tableId);
        } catch (err) {
            // Resta nella vista storna: non perdere la selezione.
            showToast({ message: mapStornoError(err), type: "error" });
        } finally {
            setIsSavingStorno(false);
        }
    }

    useEffect(() => {
        if (!open || !tableId) {
            setData(null);
            setError(null);
            setShowAllRecent(false);
            setView("conto");
            setStornaOrder(null);
            setStornaResiduals(null);
            setStornaState({ estimate: 0, canConfirm: false });
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

    // Blocchi del conto: ogni comanda (delivered|cancelled, non-storno) con i
    // suoi storni agganciati + netto per ordine. Gli storni il cui padre non è
    // nel conto restano righe standalone. Ordine preservato da `recentOrders`
    // (submitted_at DESC → comanda più recente in alto).
    const contoStornoByParent = new Map<string, V2OrderWithItems[]>();
    for (const o of recentOrders) {
        if (o.is_rectification && o.parent_order_id) {
            const arr = contoStornoByParent.get(o.parent_order_id);
            if (arr) arr.push(o);
            else contoStornoByParent.set(o.parent_order_id, [o]);
        }
    }
    const contoParentIds = new Set(
        recentOrders.filter(o => !o.is_rectification).map(o => o.id)
    );
    const contoUnits: ContoUnit[] = [];
    for (const o of recentOrders) {
        if (!o.is_rectification) {
            const storni = contoStornoByParent.get(o.id) ?? [];
            const netto =
                o.total_amount - storni.reduce((s, c) => s + c.total_amount, 0);
            contoUnits.push({ kind: "order", order: o, storni, netto });
        } else if (!o.parent_order_id || !contoParentIds.has(o.parent_order_id)) {
            contoUnits.push({ kind: "orphan", storno: o });
        }
    }

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

    const stateSummary = data ? (
        <div className={styles.summary}>
            <StatusBadge variant={statusVariant} label={statusLabel} />
            {data.table.seats != null && (
                <Text variant="body-sm" colorVariant="muted">
                    {data.table.seats} {data.table.seats === 1 ? "posto" : "posti"}
                </Text>
            )}
            {isOccupied && firstSeenAt && (
                <span className={styles.elapsed}>
                    <Clock size={13} aria-hidden />
                    <Text variant="body-sm" colorVariant="muted">
                        da {formatElapsedMinutes(firstSeenAt)}
                    </Text>
                </span>
            )}
        </div>
    ) : null;

    const loadingRows = (
        <Card flush>
            <ListRow loading />
            <ListRow loading />
            <ListRow loading />
        </Card>
    );

    return (
        <SystemDrawer open={open} onClose={onClose} size="md" aria-labelledby={titleId} autoFocusFirstInput={false}>
            <DrawerLayout
                title={
                    view === "storna"
                        ? "Storna articoli"
                        : `${tableLabel}${zoneName ? ` · ${zoneName}` : ""}`
                }
                titleId={titleId}
                onClose={onClose}
                footer={
                    view === "storna" ? (
                        <>
                            {stornaState.estimate > 0 && (
                                <Text weight={600} className={styles.footerEstimate}>
                                    Storno stimato −{formatEur(stornaState.estimate)}
                                </Text>
                            )}
                            <Button
                                variant="secondary"
                                onClick={handleBackToConto}
                                disabled={isSavingStorno}
                            >
                                Torna al conto
                            </Button>
                            <Button
                                type="submit"
                                form="conto-storna-form"
                                variant="primary"
                                loading={isSavingStorno}
                                disabled={!stornaState.canConfirm || isSavingStorno}
                            >
                                Conferma storno
                            </Button>
                        </>
                    ) : hasClosePermission && !nothingToClose && tableId ? (
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
                {view === "storna" ? (
                    <div className={styles.content}>
                        <Text variant="body-sm" colorVariant="muted">
                            {tableLabel}
                            {zoneName ? ` · ${zoneName}` : ""}
                        </Text>
                        {stornaOrder ? (
                            <OrderRectifyForm
                                formId="conto-storna-form"
                                order={stornaOrder}
                                residuals={stornaResiduals}
                                onSubmit={handleConfirmStorno}
                                onStateChange={setStornaState}
                                disabled={isSavingStorno}
                            />
                        ) : (
                            loadingRows
                        )}
                    </div>
                ) : isLoading && !data ? (
                    loadingRows
                ) : error ? (
                    <InlineBanner
                        variant="error"
                        action={
                            <Button variant="secondary" size="sm" onClick={() => void loadDetail()}>
                                Riprova
                            </Button>
                        }
                    >
                        Non riusciamo a caricare il tavolo: {error}
                    </InlineBanner>
                ) : data ? (
                    <div className={styles.content}>
                        {stateSummary}

                        {canManageTable && (
                            <div className={styles.controls}>
                                {data.sessions.some(s => s.bill_requested_at) && (
                                    <ListRow
                                        leading={<Receipt size={20} aria-hidden />}
                                        title="Conto richiesto"
                                        subtitle="Il tavolo ha chiesto il conto."
                                        trailing={
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => void handleClearBill()}
                                                loading={isClearingBill}
                                            >
                                                Segna conto portato
                                            </Button>
                                        }
                                    />
                                )}
                                {data.sessions.some(s => s.waiter_called_at) && (
                                    <ListRow
                                        leading={<ConciergeBell size={20} aria-hidden />}
                                        title="Cameriere chiamato"
                                        subtitle="Il tavolo ha chiamato il cameriere."
                                        trailing={
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                onClick={() => void handleClearWaiter()}
                                                loading={isClearingWaiter}
                                            >
                                                Segna cameriere arrivato
                                            </Button>
                                        }
                                    />
                                )}
                                <ListRow
                                    leading={<Wrench size={20} aria-hidden />}
                                    title="Fuori servizio"
                                    subtitle={
                                        isOccupied
                                            ? "Chiudi prima il tavolo per metterlo fuori servizio."
                                            : "I clienti non potranno ordinare da questo tavolo finché questa opzione è attiva."
                                    }
                                    wrapSubtitle
                                    trailing={
                                        <Switch
                                            ariaLabel="Fuori servizio"
                                            checked={data.table.maintenance_mode}
                                            onChange={next => void handleMaintenanceToggle(next)}
                                            disabled={isOccupied || isTogglingMaintenance}
                                        />
                                    }
                                />
                            </div>
                        )}

                        {isOccupied && (
                            <Card
                                title={`Ordini in corso (${activeOrders.length})`}
                                flush={activeOrders.length > 0}
                            >
                                {activeOrders.length === 0 ? (
                                    <Text variant="body-sm" colorVariant="muted">
                                        Sessione aperta, nessun ordine ancora.
                                    </Text>
                                ) : (
                                    <>
                                        {activeOrders.map(o => {
                                            const { variant, label } = orderStatusBadge(o.status);
                                            const isPending = o.status === "submitted";
                                            return (
                                                <ListRow
                                                    key={o.id}
                                                    title={formatAbsolute(o.submitted_at)}
                                                    subtitle={o.customer_name_snapshot || undefined}
                                                    meta={
                                                        <>
                                                            <StatusBadge variant={variant} label={label} />
                                                            <Text variant="body-sm" weight={500}>
                                                                {formatEur(o.total_amount)}
                                                            </Text>
                                                        </>
                                                    }
                                                    trailing={
                                                        isPending ? (
                                                            <Button
                                                                variant="primary"
                                                                size="sm"
                                                                leftIcon={<Check size={12} aria-hidden />}
                                                                loading={confirmingOrderId === o.id}
                                                                disabled={confirmingOrderId !== null}
                                                                onClick={() => void handleConfirmOrder(o.id, o.version)}
                                                            >
                                                                Conferma
                                                            </Button>
                                                        ) : undefined
                                                    }
                                                />
                                            );
                                        })}
                                        <ListRow
                                            title="Totale in corso"
                                            metaInline
                                            meta={<Text weight={600}>{formatEur(activeTotal)}</Text>}
                                        />
                                    </>
                                )}
                            </Card>
                        )}

                        {contoUnits.length > 0 && (
                            <Card title="Ordini del conto" flush>
                                {(showAllRecent
                                    ? contoUnits
                                    : contoUnits.slice(0, RECENT_ORDERS_CAP)
                                ).map(unit => {
                                    // Storno orfano (padre fuori dal conto): riga a sé.
                                    if (unit.kind === "orphan") return renderStornoRow(unit.storno);

                                    const o = unit.order;
                                    const hasStorni = unit.storni.length > 0;
                                    const timestamp =
                                        o.status === "delivered" && o.delivered_at
                                            ? formatAbsolute(o.delivered_at)
                                            : formatAbsolute(o.submitted_at);
                                    const { variant, label } = orderStatusBadge(o.status);
                                    // Storna solo su delivered; disabilitato a netto≤0.
                                    const canStorna = canManageTable && o.status === "delivered";
                                    const stornaDisabled = unit.netto <= 0;
                                    return (
                                        <Fragment key={o.id}>
                                            <ListRow
                                                title={timestamp}
                                                subtitle={o.customer_name_snapshot || undefined}
                                                meta={
                                                    <>
                                                        <StatusBadge variant={variant} label={label} />
                                                        {hasStorni && (
                                                            <Text
                                                                variant="body-sm"
                                                                colorVariant="muted"
                                                                className={styles.grossStrike}
                                                            >
                                                                {formatEur(o.total_amount)}
                                                            </Text>
                                                        )}
                                                        <Text variant="body-sm" weight={hasStorni ? 600 : 500}>
                                                            {formatEur(hasStorni ? unit.netto : o.total_amount)}
                                                        </Text>
                                                    </>
                                                }
                                                trailing={
                                                    canStorna ? (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            leftIcon={<RotateCcw size={12} aria-hidden />}
                                                            onClick={() => void handleOpenStorna(o)}
                                                            disabled={stornaDisabled || stornaLoadingOrderId !== null}
                                                            title={stornaDisabled ? "Ordine già stornato per intero" : undefined}
                                                        >
                                                            {stornaLoadingOrderId === o.id ? "Apro…" : "Storna"}
                                                        </Button>
                                                    ) : undefined
                                                }
                                            />
                                            {unit.storni.map(st => renderStornoRow(st))}
                                        </Fragment>
                                    );
                                })}
                                {!showAllRecent && contoUnits.length > RECENT_ORDERS_CAP && (
                                    <div className={styles.showAll}>
                                        <Button variant="ghost" size="sm" onClick={() => setShowAllRecent(true)}>
                                            Mostra tutti ({contoUnits.length - RECENT_ORDERS_CAP} in più)
                                        </Button>
                                    </div>
                                )}
                                {currentTotal != null && (
                                    <ListRow
                                        title="Da pagare"
                                        metaInline
                                        subtitle={
                                            recentOrders.some(o => o.is_rectification)
                                                ? "storni già scalati"
                                                : undefined
                                        }
                                        meta={
                                            <Text variant="title-sm" weight={700}>
                                                {formatEur(currentTotal)}
                                            </Text>
                                        }
                                    />
                                )}
                            </Card>
                        )}
                    </div>
                ) : null}
            </DrawerLayout>
        </SystemDrawer>
    );
}

export default TableDetailDrawer;
