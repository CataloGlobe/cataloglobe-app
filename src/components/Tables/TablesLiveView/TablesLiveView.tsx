import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Grid2X2 } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";

import { useToast } from "@/context/Toast/ToastContext";
import { closeTable } from "@/services/supabase/customerSessions";
import type { V2TableWithState } from "@/types/orders";

import { TableDetailDrawer } from "@/components/Tables/TableDetailDrawer/TableDetailDrawer";
import TableCloseDrawer from "@/pages/Dashboard/Tables/TableCloseDrawer";

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

type StatusFilter = "all" | "open" | "free" | "maintenance";

const NO_ZONE_KEY = "__no_zone__";
const NO_ZONE_LABEL = "Senza zona";

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Tutti" },
    { value: "open", label: "Aperti" },
    { value: "free", label: "Liberi" },
    { value: "maintenance", label: "Manutenzione" }
];

function formatElapsed(sessionsCount: number): string {
    // Snapshot semplice: vista aggregata. Il drawer dettaglio mostra
    // il tempo reale calcolato da customer_sessions.first_seen_at.
    return sessionsCount > 0 ? "in corso" : "";
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
            if (statusFilter === "maintenance") return t.maintenance_mode;
            if (statusFilter === "open")
                return t.active_sessions_count > 0 && !t.maintenance_mode;
            if (statusFilter === "free")
                return t.active_sessions_count === 0 && !t.maintenance_mode;
            return true;
        });
    }, [items, statusFilter]);

    const summary = useMemo(() => {
        const open = items.filter(
            t => t.active_sessions_count > 0 && !t.maintenance_mode
        ).length;
        const free = items.filter(
            t => t.active_sessions_count === 0 && !t.maintenance_mode
        ).length;
        const seats = items.reduce(
            (acc, t) => acc + (t.seats ?? 0) * (t.active_sessions_count > 0 ? 1 : 0),
            0
        );
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
                    {summary.open} {summary.open === 1 ? "aperto" : "aperti"} ·{" "}
                    {summary.free} {summary.free === 1 ? "libero" : "liberi"}
                    {summary.seats > 0 && ` · ${summary.seats} coperti`}
                </Text>
            </div>

            <div className={styles.filterRow} role="tablist">
                {FILTER_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        type="button"
                        role="tab"
                        aria-selected={statusFilter === opt.value}
                        className={
                            statusFilter === opt.value
                                ? styles.filterButtonActive
                                : styles.filterButton
                        }
                        onClick={() => setStatusFilter(opt.value)}
                    >
                        {opt.label}
                    </button>
                ))}
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
                                    const status = t.maintenance_mode
                                        ? "maintenance"
                                        : t.active_sessions_count > 0
                                          ? "occupied"
                                          : "free";
                                    // Card sempre cliccabili: il detail
                                    // drawer e' interno al componente e
                                    // sempre disponibile.
                                    const cardClass = `${styles.card} ${styles[`card_${status}`]} ${styles.cardClickable}`;
                                    return (
                                        <article
                                            key={t.id}
                                            className={cardClass}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleTableClick(t.id)}
                                            onKeyDown={e => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    handleTableClick(t.id);
                                                }
                                            }}
                                        >
                                            <div className={styles.cardHeader}>
                                                <Text weight={600} className={styles.cardLabel}>
                                                    {t.label}
                                                </Text>
                                                {status === "maintenance" && (
                                                    <StatusBadge
                                                        variant="warning"
                                                        label="Manutenzione"
                                                    />
                                                )}
                                                {status === "occupied" && (
                                                    <StatusBadge variant="success" label="Occupato" />
                                                )}
                                                {status === "free" && (
                                                    <StatusBadge variant="neutral" label="Libero" />
                                                )}
                                            </div>

                                            <div className={styles.cardMeta}>
                                                {t.seats != null && (
                                                    <Text
                                                        variant="body-sm"
                                                        colorVariant="muted"
                                                    >
                                                        {t.seats}{" "}
                                                        {t.seats === 1 ? "posto" : "posti"}
                                                    </Text>
                                                )}
                                            </div>

                                            {status === "occupied" && (
                                                <div className={styles.cardBadges}>
                                                    <span className={styles.badgeNeutral}>
                                                        {t.active_sessions_count}{" "}
                                                        {t.active_sessions_count === 1
                                                            ? "sessione"
                                                            : "sessioni"}
                                                    </span>
                                                    {t.pending_orders_count > 0 && (
                                                        <span className={styles.badgeAccent}>
                                                            {t.pending_orders_count} pending
                                                        </span>
                                                    )}
                                                    {t.bill_requested_count > 0 && (
                                                        <span className={styles.badgeDanger}>
                                                            Conto richiesto
                                                        </span>
                                                    )}
                                                    {formatElapsed(t.active_sessions_count) && (
                                                        <span className={styles.elapsed}>
                                                            {formatElapsed(t.active_sessions_count)}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            <ChevronRight
                                                size={16}
                                                className={styles.cardChevron}
                                                aria-hidden
                                            />
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
