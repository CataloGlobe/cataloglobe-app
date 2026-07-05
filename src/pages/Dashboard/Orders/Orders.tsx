import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { AlertCircle, Calendar, ChevronLeft, ChevronRight, ClipboardList, Plus, RefreshCw, RotateCcw, Volume2, VolumeX } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import { Tabs } from "@/components/ui/Tabs/Tabs";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { Button } from "@/components/ui/Button/Button";
import { TablesLiveView } from "@/components/Tables/TablesLiveView/TablesLiveView";
import { PageGate } from "@/components/PageGate/PageGate";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useSedeScope, SCOPE_ALL } from "@/hooks/useSedeScope";
import { usePlanFeatures } from "@/lib/planFeatures";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";

import {
    acknowledgeOrder,
    markOrderReady,
    deliverOrder,
    cancelOrderAdmin,
    cancelOrderItem,
    restoreOrder,
    unacknowledgeOrder,
    unreadyOrder,
    undeliverToReady,
    uncancelToSubmitted,
    uncancelToAcknowledged,
    uncancelToReady,
    listOrdersHistory,
    getOperativeDayBounds
} from "@/services/supabase/orders";
import type { CancelOrderItemResult } from "@/services/supabase/orders";
import type { V2OrderWithItems } from "@/types/orders";

import { listTables } from "@/services/supabase/tables";
import { getTenantMemberNames } from "@/services/supabase/team";
import type { V2Table } from "@/types/orders";

import OrderDetailDrawer from "./OrderDetailDrawer";
import PrintReceipt from "./PrintReceipt";
import OrderCancelDrawer from "./OrderCancelDrawer";
import OrderCancelItemDrawer from "./OrderCancelItemDrawer";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { makeHistoryColumns, type HistoryRow } from "./historyColumns";
import OrdersKanban from "./OrdersKanban";
import { CreateOrderDrawer } from "./CreateOrderDrawer/CreateOrderDrawer";
import { useActiveOrdersRealtime } from "./hooks/useActiveOrdersRealtime";
import { useNewOrderAlert } from "./hooks/useNewOrderAlert";
import { useNotificationChime } from "@/hooks/useNotificationChime";

import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";
import { todayIsoDate, shiftIsoDate } from "@/utils/dateLocal";

import styles from "./Orders.module.scss";

type MainTab = "comande" | "tavoli" | "storico";
type HistoryFilter = "all" | "delivered" | "cancelled";

// Label giorno Storico (es. "sab 5 lug"). Costruito da campi locali della
// data civile, coerente con dateLocal (mai `new Date("YYYY-MM-DD")`).
const historyDayFormatter = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short"
});
function formatHistoryDay(iso: string): string {
    const y = Number(iso.slice(0, 4));
    const mo = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    if (!y || !mo || !d) return iso;
    const raw = historyDayFormatter.format(new Date(y, mo - 1, d));
    return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Riga Storico con gli storni figli agganciati. `storni` vive qui (non in
 * `HistoryRow`): il rowWrapper li renderizza come sotto-righe DENTRO il blocco
 * del padre.
 */
type HistoryRowWithStorni = HistoryRow & { storni?: HistoryRow[] };

const STORNO_CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatStornoEur(n: number): string {
    return STORNO_CURRENCY_FORMATTER.format(n);
}

/**
 * Sotto-riga storno: NON è una riga del DataTable, ma vive DENTRO il blocco
 * del padre (rowWrapper) allineata alla gabbia delle colonne. Il box esterno
 * (`stornoStripRow`) usa padding-left 144px (= padding 24 + Stato 120) per
 * partire sotto "Tavolo" e padding-right 80px (= azioni 56 + gutter 24) per
 * fermarsi a fine "Totale" (mai dentro il kebab). Dentro: card rosa compatta
 * con connettore a sinistra. Niente netto qui (è nella colonna Totale del padre).
 *   ↳  ⟲ Storno · <articoli> · <motivo>                          −<importo>
 */
function StornoStrip({ storno }: { storno: HistoryRow }) {
    const items = (storno.items ?? [])
        .map(it => `${it.quantity}× ${it.product_name_snapshot}`)
        .join(", ");
    return (
        <div className={styles.stornoStripRow}>
            <div className={styles.stornoStrip}>
                <div className={styles.stornoStripLeft}>
                    <span className={styles.stornoStripArrow} aria-hidden>
                        ↳
                    </span>
                    <RotateCcw size={12} aria-hidden className={styles.stornoStripIcon} />
                    <span className={styles.stornoStripTag}>Storno</span>
                    {items && (
                        <>
                            <span className={styles.stornoStripSep} aria-hidden>
                                ·
                            </span>
                            <span className={styles.stornoStripItems}>{items}</span>
                        </>
                    )}
                    {storno.notes && (
                        <>
                            <span className={styles.stornoStripSep} aria-hidden>
                                ·
                            </span>
                            <span className={styles.stornoStripReason}>
                                {storno.notes}
                            </span>
                        </>
                    )}
                </div>
                <span className={styles.stornoStripAmount}>
                    {formatStornoEur(-storno.total_amount)}
                </span>
            </div>
        </div>
    );
}

export default function Orders() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { hasFeature } = usePlanFeatures();
    const { canEdit } = useSubscriptionGuard();
    const [searchParams, setSearchParams] = useSearchParams();

    // Sede in modalità single-site: viene dal selettore navbar
    // (SEDE_NAVBAR_ROUTES + SEDE_SINGLE_SITE_ROUTES → niente "Tutte le sedi",
    // localStorage cross-session via key globale "cataloglobe:orders:lastActivityId").
    const sedeScope = useSedeScope({ routeKey: "orders" });
    const selectedActivityId: string | null =
        sedeScope.value === SCOPE_ALL ? null : sedeScope.value;

    // Main tabs (3 sezioni principali), init da ?tab=
    const initialMainTab: MainTab = useMemo(() => {
        const t = searchParams.get("tab");
        return t === "tavoli" || t === "storico" ? t : "comande";
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [mainTab, setMainTab] = useState<MainTab>(initialMainTab);
    const handleTabChange = useCallback((next: MainTab) => {
        setMainTab(next);
        setSearchParams(prev => {
            prev.set("tab", next);
            return prev;
        }, { replace: true });
    }, [setSearchParams]);

    // Data
    const [tables, setTables] = useState<V2Table[]>([]);

    // Attribuzione operatore: user_id → display_name. Fetch UNA volta per
    // tenantId (membri del tenant cambiano raramente, no realtime). Map
    // vuota in caso di errore RPC → fallback "Staff" sulla pill.
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(
        () => new Map()
    );

    // Storico (delivered + cancelled della giornata operativa)
    const [historyOrders, setHistoryOrders] = useState<V2OrderWithItems[]>([]);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<Error | null>(null);
    const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
    // Giorno operativo visualizzato nello Storico (data civile "YYYY-MM-DD"
    // Europe/Rome). Default = oggi. La FINESTRA [start,end) è sempre risolta
    // server-side da getOperativeDayBounds(historyDate): qui la stringa data
    // serve solo per UI + navigazione ±1 giorno (pura aritmetica calendario).
    const today = useMemo(() => todayIsoDate(), []);
    const [historyDate, setHistoryDate] = useState<string>(() => today);

    // Filtri (tab Comande): solo dropdown tavolo.
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Detail drawer
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    // HistoryRowWithStorni (non V2OrderWithItems grezzo): dallo Storico l'ordine
    // porta a runtime l'annotazione `rectified`/`netTotal`/`storni` — tipizzarla
    // qui la preserva fino al drawer. Dalla board Comande arriva un ordine grezzo
    // (campi opzionali assenti) → assegnabile, quel path resta invariato.
    const [orderInDetail, setOrderInDetail] = useState<HistoryRowWithStorni | null>(null);

    // Standalone print (from card, without opening the detail drawer)
    const [orderToPrint, setOrderToPrint] = useState<V2OrderWithItems | null>(null);
    const standalonePrintRef = useRef<HTMLDivElement>(null);

    // Cancel drawer
    const [isCancelOpen, setIsCancelOpen] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<V2OrderWithItems | null>(null);

    // Cancel-item drawer (annullo articolo pre-servizio)
    const [isCancelItemOpen, setIsCancelItemOpen] = useState(false);
    const [orderToCancelItem, setOrderToCancelItem] = useState<V2OrderWithItems | null>(null);

    // Create order drawer (entry "Crea ordine" da headerActions)
    const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);

    // Permessi per gating "Crea ordine": stesso hook usato dalla Sidebar
    // (PermissionsContext, montato dentro /business/:businessId/*).
    const { permissions } = usePermissions();
    const canManage =
        !!selectedActivityId &&
        !!permissions &&
        canDoOnActivity(permissions, "orders.manage", selectedActivityId);
    const canCreateOrder = canManage;

    // Table detail + close drawer (tab "Tavoli"): ora interni a
    // TablesLiveView (Step 4c + close-table). Nessuno state qui.

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
            // Bounds SEMPRE da RPC (DST-safe, unico punto di verità): mai
            // calcolati in JS. historyDate === today ⇒ stessa finestra del
            // no-arg (DEFAULT server-side).
            const { dayStart, dayEnd } = await getOperativeDayBounds(historyDate);
            const data = await listOrdersHistory(
                tenantId,
                selectedActivityId,
                dayStart,
                dayEnd
            );
            setHistoryOrders(data);
        } catch (err) {
            setHistoryError(err instanceof Error ? err : new Error("Errore caricamento storico"));
        } finally {
            setIsHistoryLoading(false);
        }
    }, [tenantId, selectedActivityId, historyDate]);

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
    const { triggerAlert, pulseToken } = useNewOrderAlert({
        submittedCount
    });
    triggerAlertRef.current = triggerAlert;

    // Muto unico dei suoni operativi (ordini/conto/cameriere/prenotazioni):
    // store condiviso reattivo. Stessa interfaccia del dispatcher.
    const { soundEnabled, toggleSound } = useNotificationChime();

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

    // Fetch nomi operatori una volta per tenant. Cancellation via flag locale
    // per evitare setState dopo unmount o swap tenantId rapido.
    useEffect(() => {
        if (!tenantId) {
            setOperatorNames(new Map());
            return;
        }
        let cancelled = false;
        void (async () => {
            const map = await getTenantMemberNames(tenantId);
            if (!cancelled) setOperatorNames(map);
        })();
        return () => {
            cancelled = true;
        };
    }, [tenantId]);

    // Reset filtri al cambio sede.
    useEffect(() => {
        setTableFilter("all");
        setHistoryFilter("all");
        setHistoryDate(today);
    }, [selectedActivityId, today]);

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
                {canCreateOrder && (
                    <Button
                        variant="primary"
                        className={styles.toolbarCta}
                        leftIcon={<Plus size={16} />}
                        onClick={() => setIsCreateOrderOpen(true)}
                        disabled={!canEdit}
                    >
                        Crea ordine
                    </Button>
                )}
                <Button
                    variant="secondary"
                    className={styles.toolbarCta}
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
                            ? "Disattiva suoni notifiche"
                            : "Attiva suoni notifiche"
                    }
                    title={
                        soundEnabled
                            ? "Suoni notifiche attivi"
                            : "Suoni notifiche disattivati"
                    }
                >
                    {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                </button>
            </div>
        ),
        [canCreateOrder, canEdit, selectedActivityId, refreshAll, isLoadingOrders, soundEnabled, toggleSound]
    );

    const headerLeading = useMemo(() => (
        <Tabs<MainTab>
            value={mainTab}
            onChange={handleTabChange}
            variant="line"
        >
            <Tabs.List>
                <Tabs.Tab value="comande">Comande</Tabs.Tab>
                <Tabs.Tab value="tavoli">Tavoli</Tabs.Tab>
                <Tabs.Tab value="storico">Storico</Tabs.Tab>
            </Tabs.List>
        </Tabs>
    ), [mainTab, handleTabChange]);

    // Plan gate (computed early; the actual lock screen render is below,
    // after all hooks, to respect the Rules of Hooks).
    const isLocked = !hasFeature("table_ordering");

    // When locked, pass null so the PageHeaderSlot stays empty (toolbar/tab
    // are owned by MainLayout via context, not by this component's render).
    const headerConfig = useMemo(
        () => isLocked
            ? null
            : { leading: headerLeading, actions: headerActions, sticky: true },
        [isLocked, headerLeading, headerActions]
    );
    usePageHeader(headerConfig);

    // ── Filtering (client-side: solo tableId) ──
    const filteredOrders = useMemo(() => {
        if (tableFilter === "all") return activeOrders;
        return activeOrders.filter(o => o.table_id === tableFilter);
    }, [activeOrders, tableFilter]);

    // ── Storico: annotazione (rectified + netto) + storni agganciati al padre ──
    // Calcolato sull'insieme COMPLETO (pre-filtro segmenti) così il padre
    // conosce i suoi storni anche nel segmento "Serviti".
    const annotatedHistory = useMemo<HistoryRowWithStorni[]>(() => {
        // Mappa figli storno per parent_order_id.
        const stornoByParent = new Map<string, V2OrderWithItems[]>();
        for (const o of historyOrders) {
            if (o.is_rectification && o.parent_order_id) {
                const arr = stornoByParent.get(o.parent_order_id);
                if (arr) arr.push(o);
                else stornoByParent.set(o.parent_order_id, [o]);
            }
        }

        const groupTime = (o: V2OrderWithItems): number =>
            new Date(o.updated_at).getTime();

        const parents = historyOrders.filter(o => !o.is_rectification);
        const parentIds = new Set(parents.map(p => p.id));

        // Una riga per comanda: il padre porta i suoi storni in `storni`
        // (resi come sotto-righe DENTRO il blocco padre dal rowWrapper).
        // Nessuna riga storno interlacciata → il contatore conta le comande.
        const rows: HistoryRowWithStorni[] = parents.map(p => {
            const children = (stornoByParent.get(p.id) ?? [])
                .slice()
                .sort(
                    (a, b) =>
                        new Date(a.created_at).getTime() -
                        new Date(b.created_at).getTime()
                );
            const hasStorno = children.length > 0;
            if (!hasStorno) return p;
            const net =
                p.total_amount - children.reduce((s, c) => s + c.total_amount, 0);
            return { ...p, rectified: true, netTotal: net, storni: children };
        });

        // Edge case orfano: storno il cui padre non è nell'insieme (es. padre
        // servito ieri, storno oggi) → riga standalone, non persa.
        for (const o of historyOrders) {
            if (
                o.is_rectification &&
                (!o.parent_order_id || !parentIds.has(o.parent_order_id))
            ) {
                rows.push(o);
            }
        }

        // Ordine: per timestamp più recente DESC. Per un padre rettificato il
        // timestamp è il max tra il suo updated_at e i created_at degli storni.
        const rowTime = (r: HistoryRowWithStorni): number =>
            Math.max(groupTime(r), ...(r.storni ?? []).map(groupTime));
        return rows.sort((a, b) => rowTime(b) - rowTime(a));
    }, [historyOrders]);

    // ── Storico: filtro segmenti (dopo annotazione) ──
    const filteredHistory = useMemo<HistoryRowWithStorni[]>(() => {
        if (historyFilter === "delivered") {
            // Serviti: esclude gli storni orfani (non inquina il conteggio).
            return annotatedHistory.filter(
                o => o.status === "delivered" && !o.is_rectification
            );
        }
        if (historyFilter === "cancelled") {
            return annotatedHistory.filter(o => o.status === "cancelled");
        }
        return annotatedHistory; // "all" — padri (con storni annidati) + orfani
    }, [annotatedHistory, historyFilter]);

    // ── Storico: navigazione giorno operativo ──
    const isToday = historyDate === today;
    const dayLabel = useMemo(() => {
        if (historyDate === today) return "Oggi";
        if (historyDate === shiftIsoDate(today, -1)) return "Ieri";
        return formatHistoryDay(historyDate);
    }, [historyDate, today]);
    const goPrevDay = useCallback(() => {
        setHistoryDate(d => shiftIsoDate(d, -1));
    }, []);
    const goNextDay = useCallback(() => {
        setHistoryDate(d => {
            const next = shiftIsoDate(d, 1);
            return next > today ? d : next; // mai oltre oggi (nessun futuro)
        });
    }, [today]);
    const onPickDay = useCallback(
        (iso: string) => {
            if (!iso) return; // input svuotato → ignora
            setHistoryDate(iso > today ? today : iso);
        },
        [today]
    );

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
        // Cattura lo stato d'origine PRIMA del deliver per scegliere il
        // ramo undo: ready -> undeliverToReady (mantiene ready_at);
        // acknowledged ("Servito direttamente") -> restoreOrder
        // (delivered → acknowledged, azzera anche ready_at che era NULL).
        const priorStatus = order.status;
        try {
            const res = await deliverOrder(order.id, order.version);
            applyLocalPatch({
                id: res.order_id,
                status: res.status,
                version: res.version,
                delivered_at: res.delivered_at
            });
            // Undo inline: usa SEMPRE la versione post-deliver (res.version),
            // NON order.version che e' ormai stale.
            showToast({
                message: `Ordine ${labelFor(order)} servito`,
                type: "success",
                actionLabel: "Annulla",
                onAction: () => {
                    void (async () => {
                        try {
                            if (priorStatus === "ready") {
                                const undone = await undeliverToReady(
                                    res.order_id,
                                    res.version
                                );
                                applyLocalPatch({
                                    id: undone.order_id,
                                    status: undone.status,
                                    version: undone.version,
                                    delivered_at: null
                                    // ready_at intatto: l'ordine torna proprio
                                    // nello stato `ready` precedente.
                                });
                            } else {
                                const restored = await restoreOrder(
                                    res.order_id,
                                    res.version
                                );
                                applyLocalPatch({
                                    id: restored.order_id,
                                    status: restored.status,
                                    version: restored.version,
                                    delivered_at: null,
                                    ready_at: null
                                });
                            }
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

    function handleViewDetail(order: HistoryRowWithStorni) {
        setOrderInDetail(order);
        setIsDetailOpen(true);
    }

    function handlePrint(order: V2OrderWithItems) {
        // flushSync forces a synchronous DOM update so standalonePrintRef is
        // populated before window.print() is called — no useEffect/flag needed.
        flushSync(() => setOrderToPrint(order));
        if (standalonePrintRef.current) {
            standalonePrintRef.current.setAttribute("data-printing", "true");
            window.print();
            standalonePrintRef.current.removeAttribute("data-printing");
        }
        setOrderToPrint(null);
    }

    function handleCancelOpen(order: V2OrderWithItems) {
        setOrderToCancel(order);
        setIsCancelOpen(true);
    }

    async function handleCancelConfirm(reason: string) {
        if (!orderToCancel) return;
        const trimmed = reason.trim();
        // Cattura priorStatus PRIMA del cancel per scegliere il ramo undo.
        // cancel-order-admin preserva acknowledged_at + ready_at, quindi il
        // ripristino e' esatto: cancelled → priorStatus.
        const orderRef = orderToCancel;
        const priorStatus = orderToCancel.status;
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
                message: `Ordine ${labelFor(orderRef)} cancellato`,
                type: "success",
                actionLabel: "Annulla",
                onAction: () => {
                    void (async () => {
                        try {
                            // Usa SEMPRE res.version post-cancel (order.version
                            // ormai stale).
                            let undone:
                                | { order_id: string; status: V2OrderWithItems["status"]; version: number }
                                | null = null;
                            if (priorStatus === "submitted") {
                                undone = await uncancelToSubmitted(res.order_id, res.version);
                            } else if (priorStatus === "acknowledged") {
                                undone = await uncancelToAcknowledged(res.order_id, res.version);
                            } else if (priorStatus === "ready") {
                                undone = await uncancelToReady(res.order_id, res.version);
                            }
                            if (!undone) {
                                // priorStatus non in {submitted, acknowledged, ready}:
                                // non puo' succedere — cancel-order-admin accetta
                                // solo questi 3 source. Defensive no-op.
                                return;
                            }
                            applyLocalPatch({
                                id: undone.order_id,
                                status: undone.status,
                                version: undone.version,
                                cancelled_at: null,
                                cancelled_by: null,
                                cancellation_reason: null
                            });
                            showToast({
                                message: `Ordine ${labelFor(orderRef)} ripristinato`,
                                type: "info"
                            });
                        } catch (err) {
                            handleTransitionError(err, orderRef, "il ripristino");
                        }
                    })();
                }
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
            handleTransitionError(err, orderRef, "la cancellazione");
            setIsCancelOpen(false);
            setOrderToCancel(null);
        }
    }

    function handleCancelItemOpen(order: V2OrderWithItems) {
        setOrderToCancelItem(order);
        setIsCancelItemOpen(true);
    }

    async function handleCancelItemConfirm(itemIds: string[], reason: string) {
        if (!orderToCancelItem || !tenantId) return;
        try {
            // La RPC è per-item: loop sequenziale single-item. Non atomico tra
            // item diversi → il refetch nel finally riflette lo stato reale
            // anche su fallimento parziale (accettato per il pre-servizio).
            let last: CancelOrderItemResult | undefined;
            for (const itemId of itemIds) {
                last = await cancelOrderItem(
                    orderToCancelItem.id,
                    itemId,
                    tenantId,
                    reason.length > 0 ? reason : undefined
                );
            }
            showToast({
                message: last?.order_cancelled
                    ? "Comanda annullata"
                    : itemIds.length > 1
                      ? "Articoli annullati"
                      : "Articolo annullato",
                type: "success"
            });
            setIsCancelItemOpen(false);
            setOrderToCancelItem(null);
        } catch (err) {
            if (err instanceof Error) {
                switch (err.message) {
                    case "REASON_TOO_LONG":
                        showToast({
                            message: "Il motivo è troppo lungo (max 500 caratteri)",
                            type: "error"
                        });
                        return;
                    case "INVALID_TARGET":
                        showToast({
                            message: "Non puoi annullare un articolo di una rettifica",
                            type: "error"
                        });
                        setIsCancelItemOpen(false);
                        setOrderToCancelItem(null);
                        return;
                    case "INVALID_STATE_FOR_CANCEL": {
                        const details = (err as Error & {
                            details?: { current_status?: string };
                        }).details;
                        showToast({
                            message: `Impossibile annullare: stato corrente ${details?.current_status ?? "non valido"}`,
                            type: "error"
                        });
                        setIsCancelItemOpen(false);
                        setOrderToCancelItem(null);
                        return;
                    }
                    case "INVALID_CANCEL_ITEM": {
                        const details = (err as Error & {
                            details?: { reason?: string };
                        }).details;
                        const subReason = details?.reason;
                        let msg = "Articolo non annullabile";
                        if (subReason === "ITEM_ALREADY_CANCELLED")
                            msg = "Articolo già annullato";
                        else if (subReason === "ITEM_NOT_FOUND")
                            msg = "Articolo non trovato nell'ordine";
                        showToast({ message: msg, type: "error" });
                        return;
                    }
                }
            }
            showToast({ message: "Errore durante l'annullamento", type: "error" });
        } finally {
            // Realtime copre `orders` ma NON `order_items` → refetch completo
            // per riflettere le righe annullate (come la rettifica).
            void refetchOrders();
        }
    }

    async function handleRestore(order: V2OrderWithItems) {
        try {
            // Branch sull'origine effettiva: deliver-order NON azzera ready_at,
            // quindi se l'ordine era passato per "Pronto" (ready_at != null) il
            // ripristino deve riportarlo in `ready`, altrimenti in `acknowledged`
            // (era stato servito direttamente da acknowledged).
            const cameFromReady = order.ready_at != null;
            if (cameFromReady) {
                await undeliverToReady(order.id, order.version);
            } else {
                await restoreOrder(order.id, order.version);
            }
            // Rimuovi la riga dalla lista; rientrera' nel kanban via realtime
            // (sia ready che acknowledged sono status attivi).
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

    const historyColumns = makeHistoryColumns({
        tables,
        operatorNames,
        onViewDetail: handleViewDetail,
        onRestore: handleRestore,
        onPrint: handlePrint,
        canManage
    });

    return (
        <PageGate feature="table_ordering" readPermission="orders.read" activityId={selectedActivityId}>
        {() => (
        <section className={styles.container} data-active-tab={mainTab}>
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
                            operatorNames={operatorNames}
                            isLoading={isLoadingOrders}
                            error={ordersError}
                            onRetry={() => void refetchOrders()}
                            onAcknowledge={handleAcknowledge}
                            onMarkReady={handleMarkReady}
                            onDeliver={handleDeliver}
                            onCancel={handleCancelOpen}
                            onCancelItem={handleCancelItemOpen}
                            onViewDetail={handleViewDetail}
                            onPrint={handlePrint}
                            onUnacknowledge={handleUnacknowledge}
                            onUnready={handleUnready}
                            pulseSubmittedToken={pulseToken}
                            canManage={canManage}
                            canEdit={canEdit}
                        />
                    )}
                </>
            )}

            {mainTab === "tavoli" && tenantId && selectedActivityId && (
                <TablesLiveView
                    tenantId={tenantId}
                    activityId={selectedActivityId}
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
                    ) : (
                        <div className={styles.historySection}>
                            <div className={styles.historyToolbar}>
                                <div className={styles.dayNav}>
                                    <button
                                        type="button"
                                        className={styles.dayNavBtn}
                                        onClick={goPrevDay}
                                        aria-label="Giorno precedente"
                                    >
                                        <ChevronLeft size={18} />
                                    </button>
                                    <label className={styles.dayField}>
                                        <Calendar size={15} aria-hidden="true" />
                                        <span className={styles.dayLabel}>{dayLabel}</span>
                                        <input
                                            type="date"
                                            className={styles.dayInput}
                                            value={historyDate}
                                            max={today}
                                            onChange={e => onPickDay(e.target.value)}
                                            aria-label="Scegli il giorno dello storico"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        className={styles.dayNavBtn}
                                        onClick={goNextDay}
                                        disabled={isToday}
                                        aria-label="Giorno successivo"
                                    >
                                        <ChevronRight size={18} />
                                    </button>
                                </div>
                                <SegmentedControl<HistoryFilter>
                                    value={historyFilter}
                                    onChange={setHistoryFilter}
                                    options={[
                                        { value: "all", label: "Tutti" },
                                        { value: "delivered", label: "Serviti" },
                                        { value: "cancelled", label: "Annullati" }
                                    ]}
                                />
                            </div>
                            <DataTable<HistoryRowWithStorni>
                                data={filteredHistory}
                                columns={historyColumns}
                                isLoading={isHistoryLoading}
                                getRowId={o => o.id}
                                rowWrapper={(rowEl, rowData) => {
                                    // Storno orfano: blocco standalone (solo striscia).
                                    if (rowData.is_rectification) {
                                        return (
                                            <div
                                                key={rowData.id}
                                                className={styles.rectifiedBlock}
                                            >
                                                <StornoStrip storno={rowData} />
                                            </div>
                                        );
                                    }
                                    // Padre rettificato: riga nativa + sotto-righe storno
                                    // DENTRO un unico blocco (un solo separatore in fondo).
                                    if (rowData.storni && rowData.storni.length > 0) {
                                        return (
                                            <div
                                                key={rowData.id}
                                                className={styles.rectifiedBlock}
                                            >
                                                {rowEl}
                                                {rowData.storni.map(s => (
                                                    <StornoStrip key={s.id} storno={s} />
                                                ))}
                                            </div>
                                        );
                                    }
                                    return rowEl;
                                }}
                                emptyState={{
                                    title: "Nessun ordine nello storico di oggi",
                                    description: "Gli ordini serviti o annullati nella giornata operativa appariranno qui."
                                }}
                                loadingState={{ compact: true }}
                            />
                        </div>
                    )}
                </>
            )}

            {orderToPrint && (
                <PrintReceipt
                    ref={standalonePrintRef}
                    order={orderToPrint}
                    tableLabel={tables.find(t => t.id === orderToPrint.table_id)?.label ?? "?"}
                    tableZone={tables.find(t => t.id === orderToPrint.table_id)?.zone_name ?? null}
                    operatorNames={operatorNames}
                />
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
                operatorNames={operatorNames}
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

            <OrderCancelItemDrawer
                open={isCancelItemOpen}
                order={orderToCancelItem}
                tableLabel={
                    tables.find(t => t.id === orderToCancelItem?.table_id)?.label ?? "?"
                }
                tableZone={
                    tables.find(t => t.id === orderToCancelItem?.table_id)?.zone_name ?? null
                }
                onClose={() => {
                    setIsCancelItemOpen(false);
                    setOrderToCancelItem(null);
                }}
                onConfirm={handleCancelItemConfirm}
            />

            <CreateOrderDrawer
                open={isCreateOrderOpen}
                tenantId={tenantId}
                activityId={selectedActivityId}
                onClose={() => setIsCreateOrderOpen(false)}
                onSubmitted={refreshAll}
            />
        </section>
        )}
        </PageGate>
    );
}
