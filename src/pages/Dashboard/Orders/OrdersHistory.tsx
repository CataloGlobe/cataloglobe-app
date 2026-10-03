import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { DateInput } from "@/components/ui/Input/DateInput";
import Text from "@/components/ui/Text/Text";
import { IconButton } from "@/components/ui/Button/IconButton";
import { Button } from "@/components/ui/Button/Button";
import { DataTable } from "@/components/ui/DataTable/DataTable";
import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { PageGate } from "@/components/PageGate/PageGate";

import { useTenantId } from "@/context/useTenantId";
import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/usePermissions";
import { useActivityScope } from "@/hooks/useActivityScope";
import { canDoOnActivity } from "@/lib/permissions";
import { todayIsoDate, shiftIsoDate } from "@/utils/dateLocal";

import { getOperativeDayBounds, listOrdersHistory, restoreOrder, undeliverToReady } from "@/services/supabase/orders";
import { listTables } from "@/services/supabase/tables";
import { getTenantMemberNames } from "@/services/supabase/team";
import type { V2OrderWithItems, V2Table } from "@/types/orders";

import OrderDetailDrawer from "./OrderDetailDrawer";
import PrintReceipt from "./PrintReceipt";
import { makeHistoryColumns } from "./historyColumns";
import { annotateHistory, filterHistory, type HistoryFilter, type HistoryRowWithStorni } from "./historyRows";
import { StornoStrip } from "./StornoStrip";
import { useOrderPrinting } from "./hooks/useOrderPrinting";

import styles from "./OrdersHistory.module.scss";

/**
 * Storico degli ordini (lotto B-a, §46.1 h, §21.2): le comande servite e
 * annullate di una giornata operativa della sede. Era la terza tab di
 * Comande; è una voce della sede perché è un altro momento d'uso — si
 * rilegge a servizio finito, non si tiene aperta durante. `comande?tab=storico`
 * porta qui.
 *
 * Niente realtime: vista di revisione, si rilegge all'apertura, al cambio di
 * giorno e dopo «Ripristina». Il ripristino rimette l'ordine in Comande, dove
 * il realtime della board lo riprende.
 */
export default function OrdersHistory() {
    const tenantId = useTenantId();
    const { showToast } = useToast();
    const { permissions } = usePermissions();
    // La sede dal path, ricordata come ultima usata per `/orders` (§46.1).
    const { activityId } = useActivityScope({ routeKey: "orders" });

    const canManage = !!activityId && !!permissions && canDoOnActivity(permissions, "orders.manage", activityId);

    const [tables, setTables] = useState<V2Table[]>([]);
    const [operatorNames, setOperatorNames] = useState<Map<string, string>>(() => new Map());
    const [historyOrders, setHistoryOrders] = useState<V2OrderWithItems[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [filter, setFilter] = useState<HistoryFilter>("all");
    // Giorno operativo mostrato (data civile Europe/Rome). La finestra
    // [inizio, fine) la risolve sempre il server (`getOperativeDayBounds`):
    // qui la data serve solo alla UI e al ±1 giorno.
    const today = useMemo(() => todayIsoDate(), []);
    const [day, setDay] = useState<string>(() => today);

    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [orderInDetail, setOrderInDetail] = useState<HistoryRowWithStorni | null>(null);

    const { hasPrinters, orderToPrint, printRef, handlePrint } = useOrderPrinting(tenantId, activityId);

    // Solo l'ultima lettura scrive: una risposta di «oggi» in ritardo non
    // copre il giorno scelto dopo (§47.2, corsa di `loadHistory`).
    const requestRef = useRef(0);
    const loadHistory = useCallback(async () => {
        const request = ++requestRef.current;
        if (!tenantId || !activityId) {
            setHistoryOrders([]);
            setError(null);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            const { dayStart, dayEnd } = await getOperativeDayBounds(day);
            const data = await listOrdersHistory(tenantId, activityId, dayStart, dayEnd);
            if (request === requestRef.current) setHistoryOrders(data);
        } catch (err) {
            if (request === requestRef.current) {
                setError(err instanceof Error ? err : new Error("Errore caricamento storico"));
            }
        } finally {
            if (request === requestRef.current) setIsLoading(false);
        }
    }, [tenantId, activityId, day]);

    useEffect(() => {
        void loadHistory();
    }, [loadHistory]);

    // Etichette dei tavoli: lettura di supporto, un errore non ferma lo Storico.
    const loadTables = useCallback(async () => {
        if (!tenantId || !activityId) {
            setTables([]);
            return;
        }
        try {
            setTables(await listTables(tenantId, activityId));
        } catch {
            /* silent: lookup delle etichette */
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        void loadTables();
    }, [loadTables]);

    // Nomi degli operatori, una volta per azienda. Mappa vuota se la lettura
    // fallisce: la pill dice «Staff».
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

    // Cambio sede: si riparte da oggi, tutti.
    useEffect(() => {
        setFilter("all");
        setDay(today);
    }, [activityId, today]);

    const rows = useMemo(() => annotateHistory(historyOrders), [historyOrders]);
    const filtered = useMemo(() => filterHistory(rows, filter), [rows, filter]);

    const isToday = day === today;
    const relativeDayLabel = day === today ? "Oggi" : day === shiftIsoDate(today, -1) ? "Ieri" : null;
    const goPrevDay = useCallback(() => setDay(d => shiftIsoDate(d, -1)), []);
    // Mai oltre oggi: lo Storico non ha futuro.
    const goNextDay = useCallback(
        () =>
            setDay(d => {
                const next = shiftIsoDate(d, 1);
                return next > today ? d : next;
            }),
        [today]
    );
    const onPickDay = useCallback(
        (iso: string) => {
            if (!iso) return;
            setDay(iso > today ? today : iso);
        },
        [today]
    );

    const labelFor = useCallback(
        (order: V2OrderWithItems) => tables.find(t => t.id === order.table_id)?.label ?? `#${order.id.slice(0, 6)}`,
        [tables]
    );

    async function handleRestore(order: V2OrderWithItems) {
        try {
            // deliver-order non azzera `ready_at`: se l'ordine era passato da
            // «Pronto» torna lì, altrimenti in lavorazione (servito direttamente).
            if (order.ready_at != null) {
                await undeliverToReady(order.id, order.version);
            } else {
                await restoreOrder(order.id, order.version);
            }
            setHistoryOrders(prev => prev.filter(o => o.id !== order.id));
            showToast({ message: `Ordine ${labelFor(order)} ripristinato`, type: "success" });
        } catch (err) {
            if (err instanceof Error && err.message === "OPTIMISTIC_LOCK_CONFLICT") {
                showToast({ message: "L'ordine è stato modificato da un altro utente, aggiorno lo storico", type: "warning" });
                void loadHistory();
                return;
            }
            if (err instanceof Error && err.message === "INVALID_STATE_TRANSITION") {
                const details = (err as Error & { details?: { current_status?: string } }).details;
                showToast({
                    message: `Impossibile ripristinare: stato corrente ${details?.current_status ?? "non valido"}`,
                    type: "error"
                });
                void loadHistory();
                return;
            }
            showToast({ message: "Errore durante il ripristino", type: "error" });
        }
    }

    const columns = makeHistoryColumns({
        tables,
        operatorNames,
        onViewDetail: order => {
            setOrderInDetail(order);
            setIsDetailOpen(true);
        },
        onRestore: handleRestore,
        onPrint: handlePrint,
        hasPrinters: hasPrinters === true,
        canManage
    });

    const tableOf = (order: V2OrderWithItems | null) => tables.find(t => t.id === order?.table_id);

    return (
        <PageGate feature="table_ordering" readPermission="orders.read" activityId={activityId}>
            {() => (
                <section className={styles.container}>
                    {error ? (
                        <EmptyState
                            icon={<AlertCircle size={40} strokeWidth={1.5} />}
                            title="Errore caricamento storico"
                            description={error.message}
                            action={
                                <Button variant="secondary" onClick={() => void loadHistory()}>
                                    Riprova
                                </Button>
                            }
                        />
                    ) : (
                        <div className={styles.historySection}>
                            <div className={styles.historyToolbar}>
                                <SegmentedControl<HistoryFilter>
                                    value={filter}
                                    onChange={setFilter}
                                    options={[
                                        { value: "all", label: "Tutti" },
                                        { value: "delivered", label: "Serviti" },
                                        { value: "cancelled", label: "Annullati" }
                                    ]}
                                />
                                <div className={styles.dayNav}>
                                    <IconButton
                                        icon={<ChevronLeft size={18} />}
                                        variant="secondary"
                                        onClick={goPrevDay}
                                        aria-label="Giorno precedente"
                                    />
                                    <DateInput
                                        containerClassName={styles.dayField}
                                        startAdornment={<Calendar size={16} aria-hidden="true" />}
                                        value={day}
                                        max={today}
                                        onChange={e => onPickDay(e.target.value)}
                                        aria-label="Scegli il giorno dello storico"
                                    />
                                    <IconButton
                                        icon={<ChevronRight size={18} />}
                                        variant="secondary"
                                        onClick={goNextDay}
                                        disabled={isToday}
                                        aria-label="Giorno successivo"
                                    />
                                    {relativeDayLabel && (
                                        <Text variant="body-sm" colorVariant="muted">
                                            {relativeDayLabel}
                                        </Text>
                                    )}
                                </div>
                            </div>
                            <DataTable<HistoryRowWithStorni>
                                ariaLabel="Storico degli ordini"
                                data={filtered}
                                columns={columns}
                                isLoading={isLoading}
                                getRowId={o => o.id}
                                rowWrapper={(rowEl, rowData) => {
                                    // Storno orfano: blocco a sé, solo la striscia.
                                    if (rowData.is_rectification) {
                                        return (
                                            <div key={rowData.id} className={styles.rectifiedBlock}>
                                                <StornoStrip storno={rowData} />
                                            </div>
                                        );
                                    }
                                    // Padre rettificato: la sua riga e le strisce degli
                                    // storni in un blocco solo (un separatore in fondo).
                                    if (rowData.storni && rowData.storni.length > 0) {
                                        return (
                                            <div key={rowData.id} className={styles.rectifiedBlock}>
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

                    {orderToPrint && (
                        <PrintReceipt
                            ref={printRef}
                            order={orderToPrint}
                            tableLabel={tableOf(orderToPrint)?.label ?? "?"}
                            tableZone={tableOf(orderToPrint)?.zone_name ?? null}
                            operatorNames={operatorNames}
                        />
                    )}

                    <OrderDetailDrawer
                        open={isDetailOpen}
                        order={orderInDetail}
                        tableLabel={tableOf(orderInDetail)?.label ?? "?"}
                        tableZone={tableOf(orderInDetail)?.zone_name ?? null}
                        operatorNames={operatorNames}
                        hasPrinters={hasPrinters === true}
                        onPrint={handlePrint}
                        onClose={() => {
                            setIsDetailOpen(false);
                            setOrderInDetail(null);
                        }}
                    />
                </section>
            )}
        </PageGate>
    );
}
