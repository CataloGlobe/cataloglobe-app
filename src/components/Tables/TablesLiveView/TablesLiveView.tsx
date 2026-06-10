import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Eye, Grid2X2, LogOut, Wrench } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import {
    TableRowActions,
    type TableRowAction
} from "@/components/ui/TableRowActions/TableRowActions";

import { useToast } from "@/context/Toast/ToastContext";
import { closeTable } from "@/services/supabase/customerSessions";
import { updateTable } from "@/services/supabase/tables";
import type { V2TableWithState } from "@/types/orders";

import { TableDetailDrawer } from "@/components/Tables/TableDetailDrawer/TableDetailDrawer";
import TableCloseDrawer from "@/pages/Dashboard/Tables/TableCloseDrawer";

import { deriveTableStatus } from "@/utils/tableState";

import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { useTablesLiveRealtime } from "./useTablesLiveRealtime";
import styles from "./TablesLiveView.module.scss";

export interface TablesLiveViewProps {
    tenantId: string;
    activityId: string;
}

/**
 * Durata exit-anim del SystemDrawer (motion.div drawer: transition
 * duration 0.25s). Usata per sequenziare detail → close: chiudiamo il
 * detail, attendiamo che l'animazione finisca, apriamo il close. NIENTE
 * stacking. Se SystemDrawer cambia la sua durata, aggiorna qui.
 */
const DRAWER_EXIT_DURATION_MS = 250;

type StatusFilter = "all" | "occupied" | "free" | "maintenance";

const NO_ZONE_KEY = "__no_zone__";
const NO_ZONE_LABEL = "Senza zona";

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Tutti" },
    { value: "occupied", label: "Occupati" },
    { value: "free", label: "Liberi" },
    { value: "maintenance", label: "Manutenzione" }
];

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

type TableStatus = "free" | "occupied" | "maintenance";

const STATUS_LABELS: Record<TableStatus, string> = {
    free: "Libero",
    occupied: "Occupato",
    maintenance: "Manutenzione"
};

function formatElapsedLabel(fromIso: string): string {
    const min = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 60_000));
    if (min < 1) return "< 1 min";
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function TablesLiveView({
    tenantId,
    activityId
}: TablesLiveViewProps) {
    const { showToast } = useToast();
    const { items, isLoading, error, refetch } = useTablesLiveRealtime(
        tenantId,
        activityId
    );
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    // ─── Detail drawer (click su card) ─────────────────────────────────
    const [detailTableId, setDetailTableId] = useState<string | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);

    // ─── Close drawer (apertura via "Chiudi tavolo" dal detail) ────────
    const [tableToClose, setTableToClose] = useState<V2TableWithState | null>(
        null
    );
    const [isCloseOpen, setIsCloseOpen] = useState(false);
    const [processingClose, setProcessingClose] = useState(false);

    // Cleanup pendente del timer di transizione detail→close: serve a
    // evitare race su unmount o se l'utente chiude il drawer prima del
    // setTimeout.
    const transitionTimerRef = useRef<number | null>(null);
    useEffect(() => {
        return () => {
            if (transitionTimerRef.current !== null) {
                window.clearTimeout(transitionTimerRef.current);
                transitionTimerRef.current = null;
            }
        };
    }, []);

    const handleTableClick = useCallback((tableId: string) => {
        // Guard race transizione drawer: se l'utente clicca una card
        // mentre c'e' una transizione detail->close pendente (timer
        // armato da un precedente "Chiudi tavolo"), annulla la
        // transizione. Altrimenti il timer aprirebbe il close drawer
        // della card precedente SOPRA il detail della card appena
        // cliccata -> stacking accidentale che il design sequenziale
        // evita. Niente flag/state extra: il transitionTimerRef esistente
        // e' fonte di verita' del "pending".
        if (transitionTimerRef.current !== null) {
            window.clearTimeout(transitionTimerRef.current);
            transitionTimerRef.current = null;
            setTableToClose(null);
        }
        setDetailTableId(tableId);
        setIsDetailOpen(true);
    }, []);

    // Detail richiede di aprire il close drawer: sequenza no-stack.
    // 1. lookup riga V2TableWithState in items[] (zero I/O extra).
    //    Guard: se non trovata (tavolo rimosso da realtime tra click e
    //    callback) → toast soft + non aprire il close.
    // 2. chiudi detail.
    // 3. attendi DRAWER_EXIT_DURATION_MS (matchato all'exit anim di
    //    SystemDrawer drawer motion.div) e poi apri close.
    const handleRequestClose = useCallback(
        (tableId: string) => {
            const found = items.find(t => t.id === tableId);
            if (!found) {
                showToast({
                    message: "Tavolo non trovato, ricarica la lista.",
                    type: "error"
                });
                return;
            }
            setTableToClose(found);
            setIsDetailOpen(false);
            if (transitionTimerRef.current !== null) {
                window.clearTimeout(transitionTimerRef.current);
            }
            transitionTimerRef.current = window.setTimeout(() => {
                transitionTimerRef.current = null;
                setIsCloseOpen(true);
            }, DRAWER_EXIT_DURATION_MS);
        },
        [items, showToast]
    );

    const handleMaintenanceToggle = useCallback(
        async (tableId: string, next: boolean): Promise<void> => {
            try {
                await updateTable(tableId, tenantId, { maintenance_mode: next });
                showToast({
                    message: next ? "Tavolo messo fuori servizio" : "Tavolo riattivato",
                    type: "success"
                });
                await refetch();
            } catch {
                showToast({
                    message: "Errore durante l'aggiornamento",
                    type: "error"
                });
            }
        },
        [tenantId, refetch, showToast]
    );

    // Identico per logica al pattern di TablesManagement.handleCloseConfirm
    // (toast intelligente, dual-409, refetch post-success). Duplicato per
    // ora — debt parcheggiato: estrazione in `useCloseTable` futura.
    async function handleCloseConfirm(
        action: "none" | "deliver" | "cancel"
    ): Promise<void> {
        if (!tableToClose) return;
        setProcessingClose(true);
        try {
            const result = await closeTable(
                tableToClose.id,
                action === "none" ? undefined : action
            );
            const parts: string[] = [];
            if (
                result.resolved_action === "deliver" &&
                result.resolved_orders_count > 0
            ) {
                const k = result.resolved_orders_count;
                parts.push(
                    `${k} ${k === 1 ? "ordine segnato come servito" : "ordini segnati come serviti"}`
                );
            } else if (
                result.resolved_action === "cancel" &&
                result.resolved_orders_count > 0
            ) {
                const k = result.resolved_orders_count;
                parts.push(
                    `${k} ${k === 1 ? "ordine annullato" : "ordini annullati"}`
                );
            }
            if (result.closed_groups_count > 0) {
                const k = result.closed_groups_count;
                parts.push(`${k} ${k === 1 ? "conto chiuso" : "conti chiusi"}`);
            }
            if (result.ended_sessions_count > 0) {
                const k = result.ended_sessions_count;
                parts.push(
                    `${k} ${k === 1 ? "sessione terminata" : "sessioni terminate"}`
                );
            }
            const msg =
                parts.length === 0
                    ? "Tavolo chiuso."
                    : `Tavolo chiuso: ${parts.join(", ")}.`;
            showToast({ message: msg, type: "success" });
            setIsCloseOpen(false);
            setTableToClose(null);
            await refetch();
        } catch (err) {
            if (err instanceof Error && err.message === "TABLE_HAS_OPEN_ORDERS") {
                showToast({
                    message:
                        "Il tavolo ha ordini ancora aperti. Scegli come risolverli (servi o annulla tutto) e ripeti.",
                    type: "warning"
                });
                await refetch();
                return;
            }
            showToast({
                message: "Errore durante la chiusura del tavolo",
                type: "error"
            });
        } finally {
            setProcessingClose(false);
        }
    }

    // Surface caricamento errori (rete, RLS) come toast — silenzia oltre il
    // primo per non spammare durante reconnect cycles.
    const [lastErrorReported, setLastErrorReported] = useState<string | null>(null);
    useEffect(() => {
        if (error && error !== lastErrorReported) {
            showToast({ message: "Impossibile caricare i tavoli", type: "error" });
            setLastErrorReported(error);
        }
        if (!error && lastErrorReported !== null) {
            setLastErrorReported(null);
        }
    }, [error, lastErrorReported, showToast]);

    const filtered = useMemo(() => {
        if (statusFilter === "all") return items;
        return items.filter(t => {
            const s = deriveTableStatus(t);
            if (statusFilter === "maintenance") return s === "maintenance";
            if (statusFilter === "occupied") return s === "occupied";
            if (statusFilter === "free") return s === "free";
            return true;
        });
    }, [items, statusFilter]);

    const summary = useMemo(() => {
        let open = 0;
        let free = 0;
        let seats = 0;
        for (const t of items) {
            const s = deriveTableStatus(t);
            if (s === "occupied") {
                open += 1;
                seats += t.seats ?? 0;
            } else if (s === "free") {
                free += 1;
            }
        }
        return { open, free, seats };
    }, [items]);

    // Group by zone_name (no-zone fallback last)
    const groups = useMemo(() => {
        const byZone = new Map<string, { name: string; tables: V2TableWithState[] }>();
        for (const t of filtered) {
            const key = t.zone_name ?? NO_ZONE_KEY;
            const display = t.zone_name ?? NO_ZONE_LABEL;
            if (!byZone.has(key)) {
                byZone.set(key, { name: display, tables: [] });
            }
            byZone.get(key)!.tables.push(t);
        }
        const ordered = Array.from(byZone.entries())
            .filter(([k]) => k !== NO_ZONE_KEY)
            .sort((a, b) => a[1].name.localeCompare(b[1].name, "it"))
            .map(([, v]) => v);
        if (byZone.has(NO_ZONE_KEY)) {
            ordered.push(byZone.get(NO_ZONE_KEY)!);
        }
        return ordered;
    }, [filtered]);

    return (
        <div className={styles.wrapper}>
            <div className={styles.summaryRow}>
                <Text variant="body-sm" colorVariant="muted">
                    {summary.open} {summary.open === 1 ? "occupato" : "occupati"} ·{" "}
                    {summary.free} {summary.free === 1 ? "libero" : "liberi"}
                    {summary.seats > 0 && ` · ${summary.seats} coperti`}
                </Text>
            </div>

            <div className={styles.filterControl}>
                <SegmentedControl<StatusFilter>
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={FILTER_OPTIONS}
                />
            </div>

            {!isLoading && filtered.length === 0 ? (
                <EmptyState
                    icon={<Grid2X2 size={40} strokeWidth={1.5} />}
                    title={
                        items.length === 0
                            ? "Nessun tavolo configurato"
                            : "Nessun tavolo per questo filtro"
                    }
                    description={
                        items.length === 0
                            ? "Configura i tavoli dalla scheda Tavoli della sede."
                            : "Cambia filtro per vedere altri tavoli."
                    }
                />
            ) : (
                <div className={styles.zonesList}>
                    {groups.map(group => (
                        <section key={group.name} className={styles.zoneSection}>
                            <header className={styles.zoneHeader}>
                                <Text variant="title-sm" weight={600}>
                                    {group.name}
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    {group.tables.length}{" "}
                                    {group.tables.length === 1 ? "tavolo" : "tavoli"}
                                </Text>
                            </header>
                            <div className={styles.cardsGrid}>
                                {group.tables.map(t => {
                                    const status = deriveTableStatus(t) as TableStatus;
                                    const activeOrders = t.active_orders ?? [];
                                    const submittedCount = activeOrders.filter(
                                        o => o.status === "submitted"
                                    ).length;
                                    const acknowledgedCount = activeOrders.filter(
                                        o => o.status === "acknowledged"
                                    ).length;
                                    const readyCount = activeOrders.filter(
                                        o => o.status === "ready"
                                    ).length;
                                    const hasPending =
                                        status === "occupied" && submittedCount > 0;

                                    const cardClass = [
                                        styles.card,
                                        styles[`card_${status}`],
                                        hasPending ? styles.card_pending : "",
                                        styles.cardClickable
                                    ]
                                        .filter(Boolean)
                                        .join(" ");

                                    const statusLabel = STATUS_LABELS[status];

                                    const cardActions: TableRowAction[] = [
                                        {
                                            label: "Vedi dettaglio",
                                            icon: Eye,
                                            onClick: () => handleTableClick(t.id)
                                        },
                                        {
                                            label: "Chiudi tavolo",
                                            icon: LogOut,
                                            hidden: status !== "occupied",
                                            onClick: () => handleRequestClose(t.id)
                                        },
                                        {
                                            label: t.maintenance_mode
                                                ? "Rimuovi manutenzione"
                                                : "Metti in manutenzione",
                                            icon: Wrench,
                                            hidden: status === "occupied",
                                            onClick: () =>
                                                void handleMaintenanceToggle(
                                                    t.id,
                                                    !t.maintenance_mode
                                                )
                                        }
                                    ];

                                    return (
                                        <article
                                            key={t.id}
                                            className={cardClass}
                                            role="button"
                                            tabIndex={0}
                                            aria-label={`${t.label}, ${statusLabel}`}
                                            onClick={() => handleTableClick(t.id)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    handleTableClick(t.id);
                                                }
                                            }}
                                        >
                                            {/* Row 1: dot + name + actions menu */}
                                            <div className={styles.cardRow1}>
                                                <span
                                                    className={`${styles.statusDot} ${styles[`dot_${status}`]}`}
                                                    aria-hidden
                                                />
                                                <span className={styles.cardName}>{t.label}</span>
                                                <span className={styles.cardActionsOffset}>
                                                    <TableRowActions actions={cardActions} />
                                                </span>
                                            </div>

                                            {/* Row 2: status label · seats · elapsed */}
                                            <div className={styles.cardRow2}>
                                                <span
                                                    className={`${styles.statusLabel} ${styles[`label_${status}`]}`}
                                                >
                                                    {statusLabel}
                                                </span>
                                                {t.seats != null && (
                                                    <>
                                                        <span
                                                            className={styles.metaSep}
                                                            aria-hidden
                                                        >
                                                            ·
                                                        </span>
                                                        <span>
                                                            {t.seats}{" "}
                                                            {t.seats === 1 ? "posto" : "posti"}
                                                        </span>
                                                    </>
                                                )}
                                                {status === "occupied" &&
                                                    t.session_opened_at && (
                                                        <>
                                                            <span
                                                                className={styles.metaSep}
                                                                aria-hidden
                                                            >
                                                                ·
                                                            </span>
                                                            <span>
                                                                da{" "}
                                                                {formatElapsedLabel(
                                                                    t.session_opened_at
                                                                )}
                                                            </span>
                                                        </>
                                                    )}
                                            </div>

                                            {/* Row 3: order pills + total (occupied only) */}
                                            {status === "occupied" && (
                                                <div className={styles.cardRow3}>
                                                    <div className={styles.cardPills}>
                                                        {activeOrders.length === 0 ? (
                                                            <span className={styles.pillEmpty}>
                                                                Nessun ordine
                                                            </span>
                                                        ) : (
                                                            <>
                                                                {submittedCount > 0 && (
                                                                    <span
                                                                        className={
                                                                            styles.pillPending
                                                                        }
                                                                    >
                                                                        <AlertCircle
                                                                            size={10}
                                                                            aria-hidden
                                                                        />
                                                                        {submittedCount}
                                                                    </span>
                                                                )}
                                                                {acknowledgedCount > 0 && (
                                                                    <span
                                                                        className={
                                                                            styles.pillWorking
                                                                        }
                                                                    >
                                                                        {acknowledgedCount}
                                                                    </span>
                                                                )}
                                                                {readyCount > 0 && (
                                                                    <span
                                                                        className={styles.pillReady}
                                                                    >
                                                                        {readyCount}
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                    <span className={styles.cardTotal}>
                                                        {formatEur(t.current_total)}
                                                    </span>
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}

            <TableDetailDrawer
                open={isDetailOpen}
                tenantId={tenantId}
                activityId={activityId}
                tableId={detailTableId}
                onClose={() => {
                    setIsDetailOpen(false);
                    setDetailTableId(null);
                }}
                onRequestClose={handleRequestClose}
                onMaintenanceChanged={() => void refetch()}
                onBillCleared={() => void refetch()}
            />

            <TableCloseDrawer
                open={isCloseOpen}
                table={tableToClose}
                onClose={() => {
                    if (processingClose) return;
                    setIsCloseOpen(false);
                    setTableToClose(null);
                }}
                onConfirm={handleCloseConfirm}
            />
        </div>
    );
}
