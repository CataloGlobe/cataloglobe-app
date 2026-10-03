import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Volume2, VolumeX } from "lucide-react";

import { usePageHeader } from "@/context/usePageHeader";
import type { PageHeaderCompactConfig } from "@/context/PageHeaderContext";
import { Select } from "@/components/ui/Select/Select";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { Button } from "@/components/ui/Button/Button";
import { PageGate } from "@/components/PageGate/PageGate";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { useActivityScope } from "@/hooks/useActivityScope";
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
    uncancelToReady
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
import OrdersKanban from "./OrdersKanban";
import { CreateOrderDrawer } from "./CreateOrderDrawer/CreateOrderDrawer";
import { useActiveOrdersRealtime } from "./hooks/useActiveOrdersRealtime";
import { useOrderPrinting } from "./hooks/useOrderPrinting";
import { useNewOrderAlert } from "./hooks/useNewOrderAlert";
import { useNotificationChime } from "@/hooks/useNotificationChime";

import { usePermissions } from "@/context/usePermissions";
import { canDoOnActivity } from "@/lib/permissions";

import styles from "./Orders.module.scss";

/**
 * Comande è la board e basta (lotto B-a). Le vecchie tab hanno una casa
 * loro: `?tab=storico` è la voce Storico, `?tab=tavoli` la Mappa di
 * Servizio. Ci si va prima di montare la board.
 */
export default function Orders() {
    const [searchParams] = useSearchParams();
    const tab = searchParams.get("tab");
    if (tab === "storico") return <Navigate to="../storico" relative="path" replace />;
    if (tab === "tavoli") return <Navigate to="../servizio?modo=mappa" relative="path" replace />;
    return <OrdersBoard />;
}

function OrdersBoard() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { hasFeature } = usePlanFeatures();
    const { canEdit } = useSubscriptionGuard();
    // La sede arriva dal path: la pagina è montata solo dentro il contesto
    // (`/locations/:id/comande`, §46.1), quindi qui c'è sempre. Il `null` del
    // tipo resta perché `useActivityScope` serve anche le pagine d'azienda.
    const sedeScope = useActivityScope({ routeKey: "orders" });
    const selectedActivityId: string | null = sedeScope.activityId;

    // Data
    const [tables, setTables] = useState<V2Table[]>([]);
    // Attribuzione operatore: user_id → display_name. Fetch UNA volta per
    // tenantId (membri del tenant cambiano raramente, no realtime). Map
    // vuota in caso di errore RPC → fallback "Staff" sulla pill.
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(
        () => new Map()
    );

    // Filtri: solo dropdown tavolo.
    const [tableFilter, setTableFilter] = useState<string>("all");

    // Detail drawer
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [orderInDetail, setOrderInDetail] = useState<V2OrderWithItems | null>(null);

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

    // Gating della riga "nessuna stampante" e del link "Stato stampanti":
    // NON esiste un permesso `printers.*` dedicato. Le stampanti sono
    // gestite in PrintersSection (tab Ordinazioni della sede) sotto
    // `tables.manage`, e la RLS di `printers` usa lo stesso permesso
    // (migration 20260906120300). Qui si allinea a quello: chi non puo'
    // collegare una stampante non vede l'avviso ne' il rimando.
    const canManagePrinters =
        !!selectedActivityId &&
        !!permissions &&
        canDoOnActivity(permissions, "tables.manage", selectedActivityId);
    const { businessId } = useParams<{ businessId: string }>();
    const printersHref =
        businessId && selectedActivityId
            ? `/business/${businessId}/locations/${selectedActivityId}/ordini-prenotazioni#ordini`
            : undefined;

    // Table detail + close drawer (tab "Tavoli"): ora interni a
    // TablesLiveView (Step 4c + close-table). Nessuno state qui.

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
        applyLocalPatch,
        comandaPrintStates
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

    // Stampa e ristampa (stampante cloud o dialogo del browser): «Stampa» vs
    // «Ristampa comanda» nel menu, e la riga "nessuna stampante" in testa.
    const { hasPrinters, orderToPrint, printRef, handlePrint, handleReprint } = useOrderPrinting(
        tenantId,
        selectedActivityId
    );

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
    }, [selectedActivityId]);

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
                <Tooltip content={soundEnabled ? "Suoni notifiche attivi" : "Suoni notifiche disattivati"}>
                    <IconButton
                        icon={soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                        variant="secondary"
                        className={soundEnabled ? undefined : styles.soundOff}
                        onClick={toggleSound}
                        aria-pressed={soundEnabled}
                        aria-label={soundEnabled ? "Disattiva suoni notifiche" : "Attiva suoni notifiche"}
                    />
                </Tooltip>
            </div>
        ),
        [canCreateOrder, canEdit, selectedActivityId, refreshAll, isLoadingOrders, soundEnabled, toggleSound]
    );

    // Stessa toolbar a dati per lo stato compatto. Nessuna `search`: il filtro
    // per tavolo è un select in-page, non vive nella banda.
    const headerCompact = useMemo<PageHeaderCompactConfig>(() => ({
        // Il suono resta a vista: in sala si alza o si abbassa al volo, e il suo
        // stato acceso/spento va letto senza aprire nulla.
        persistentIcons: [
            {
                icon: soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />,
                label: soundEnabled ? "Disattiva suoni notifiche" : "Attiva suoni notifiche",
                onClick: toggleSound
            }
        ],
        secondaryActions: [
            {
                label: "Aggiorna",
                onClick: refreshAll,
                disabled: !selectedActivityId || isLoadingOrders
            }
        ],
        primaryAction: canCreateOrder
            ? { label: "Crea ordine", onClick: () => setIsCreateOrderOpen(true), disabled: !canEdit }
            : undefined
    }), [
        soundEnabled,
        toggleSound,
        refreshAll,
        selectedActivityId,
        isLoadingOrders,
        canCreateOrder,
        canEdit
    ]);

    // Plan gate (computed early; the actual lock screen render is below,
    // after all hooks, to respect the Rules of Hooks).
    const isLocked = !hasFeature("table_ordering");

    // When locked, pass null so the PageHeaderSlot stays empty (toolbar/tab
    // are owned by MainLayout via context, not by this component's render).
    // Vale anche per `compact`: senza il piano la banda non esiste affatto,
    // non esiste "una versione compatta di niente".
    const headerConfig = useMemo(
        () => isLocked
            ? null
            : { actions: headerActions, compact: headerCompact },
        [isLocked, headerActions, headerCompact]
    );
    usePageHeader(headerConfig);

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

    return (
        <PageGate feature="table_ordering" readPermission="orders.read" activityId={selectedActivityId}>
        {() => (
        <section className={styles.container}>
            {selectedActivityId && hasPrinters === false && canManagePrinters && printersHref && (
                <InlineBanner
                    variant="info"
                    action={<Link to={printersHref}>Gestisci stampanti</Link>}
                >
                    Nessuna stampante collegata a questa sede: le comande non
                    vengono stampate in automatico.
                </InlineBanner>
            )}

            {tables.length > 0 && (
                <div className={styles.filtersRow}>
                    <Select
                        aria-label="Filtra per tavolo"
                        containerClassName={styles.tableFilter}
                        value={tableFilter}
                        onChange={e => setTableFilter(e.target.value)}
                        options={[
                            { value: "all", label: "Tutti i tavoli" },
                            ...tables.map(t => ({ value: t.id, label: t.label }))
                        ]}
                    />
                </div>
            )}

            <OrdersKanban
                orders={filteredOrders}
                tables={tables}
                operatorNames={operatorNames}
                comandaPrintStates={comandaPrintStates}
                onReprint={handleReprint}
                printersHref={printersHref}
                isLoading={isLoadingOrders}
                error={ordersError}
                onRetry={() => void refetchOrders()}
                onAcknowledge={handleAcknowledge}
                onMarkReady={handleMarkReady}
                onDeliver={handleDeliver}
                onCancel={handleCancelOpen}
                onCancelItem={handleCancelItemOpen}
                onViewDetail={handleViewDetail}
                onUnacknowledge={handleUnacknowledge}
                onUnready={handleUnready}
                pulseSubmittedToken={pulseToken}
                canManage={canManage}
                canEdit={canEdit}
            />

            {orderToPrint && (
                <PrintReceipt
                    ref={printRef}
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
                hasPrinters={hasPrinters === true}
                onPrint={handlePrint}
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
