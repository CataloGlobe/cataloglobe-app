import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Eye, Grid2X2, LogOut, Wrench } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { Badge } from "@/components/ui/Badge/Badge";
import { Button } from "@/components/ui/Button/Button";
import { CardGrid, CardGridItem } from "@/components/ui/CardGrid";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/StatusBadge/StatusBadge";
import {
    TableRowActions,
    type TableRowAction
} from "@/components/ui/TableRowActions/TableRowActions";

import { useToast } from "@/context/Toast/ToastContext";
import { usePermissions } from "@/context/PermissionsContext";
import { canDoOnActivity } from "@/lib/permissions";
import { closeTable } from "@/services/supabase/customerSessions";
import { updateTable } from "@/services/supabase/tables";
import type { V2TableWithState } from "@/types/orders";

import { TableDetailDrawer } from "@/components/Tables/TableDetailDrawer/TableDetailDrawer";
import { SYSTEM_DRAWER_MOTION_MS } from "@/components/layout/SystemDrawer/drawerSize";
import TableCloseDrawer from "@/pages/Dashboard/Tables/TableCloseDrawer";

import { deriveTableStatus } from "@/utils/tableState";

import { SegmentedControl } from "@/components/ui/SegmentedControl/SegmentedControl";
import { useTablesLiveRealtime } from "./useTablesLiveRealtime";
import styles from "./TablesLiveView.module.scss";

export interface TablesLiveViewProps {
    tenantId: string;
    activityId: string;
}



type StatusFilter = "all" | "occupied" | "free" | "maintenance";

const NO_ZONE_KEY = "__no_zone__";
const NO_ZONE_LABEL = "Senza zona";

const FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Tutti" },
    { value: "occupied", label: "Aperti" },
    { value: "free", label: "Liberi" },
    { value: "maintenance", label: "Fuori servizio" }
];

const CURRENCY_FORMATTER = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR"
});

function formatEur(n: number): string {
    return CURRENCY_FORMATTER.format(n);
}

type TableStatus = "free" | "occupied" | "maintenance";

const STATUS_VARIANTS: Record<TableStatus, StatusBadgeVariant> = {
    free: "neutral",
    occupied: "success",
    maintenance: "warning"
};

/** Le comande in Nuove: aspettano qualcuno, quindi stanno sulla tessera come Badge. */
function countSubmitted(orders: V2TableWithState["active_orders"]): number {
    return (orders ?? []).filter(o => o.status === "submitted").length;
}

/**
 * Il resto degli ordini attivi, per il footer: «2 in lavorazione · 1 pronta».
 * Le nuove non ci sono (sono il Badge). Nessun ordine attivo → «Nessun ordine».
 */
function formatActiveOrders(orders: V2TableWithState["active_orders"]): string | null {
    const list = orders ?? [];
    if (list.length === 0) return "Nessun ordine";
    const acknowledged = list.filter(o => o.status === "acknowledged").length;
    const ready = list.filter(o => o.status === "ready").length;
    const parts: string[] = [];
    if (acknowledged > 0) parts.push(`${acknowledged} in lavorazione`);
    if (ready > 0) parts.push(`${ready} ${ready === 1 ? "pronta" : "pronte"}`);
    return parts.length > 0 ? parts.join(" · ") : null;
}

const STATUS_LABELS: Record<TableStatus, string> = {
    free: "Libero",
    occupied: "Aperto",
    maintenance: "Fuori servizio"
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
    const { permissions } = usePermissions();
    const canManage =
        !!permissions && canDoOnActivity(permissions, "tables.manage", activityId);
    const { items, isLoading, error, refetch } = useTablesLiveRealtime(
        tenantId,
        activityId
    );
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const navigate = useNavigate();
    const zoneIdPrefix = useId();
    const { businessId } = useParams<{ businessId: string }>();

    // Il chime su nuova chiamata cameriere/conto è stato spostato nel
    // dispatcher globale `OperationalAlerts` (MainLayout): suona a prescindere
    // dalla pagina. Qui restano solo le pill in-page come indicatore.

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
    // 3. attendi SYSTEM_DRAWER_MOTION_MS (la durata che SystemDrawer esporta
    //    per la sua uscita) e poi apri close.
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
            }, SYSTEM_DRAWER_MOTION_MS);
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
                    {summary.open} {summary.open === 1 ? "aperto" : "aperti"} ·{" "}
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

            {!isLoading && items.length === 0 ? (
                <EmptyState
                    icon={<Grid2X2 />}
                    title="Nessun tavolo configurato"
                    description="Configura i tavoli dalla scheda Sala della sede."
                    action={
                        businessId ? (
                            <Button
                                variant="secondary"
                                onClick={() => navigate(`/business/${businessId}/locations/${activityId}/sala`)}
                            >
                                Vai alla Sala
                            </Button>
                        ) : undefined
                    }
                />
            ) : !isLoading && filtered.length === 0 ? (
                <EmptyState
                    variant="filtered"
                    title="Nessun tavolo per questo filtro"
                    onClearFilters={() => setStatusFilter("all")}
                />
            ) : isLoading && items.length === 0 ? (
                <CardGrid loading skeletonCount={3} aria-label="Tavoli" />
            ) : (
                <div className={styles.zonesList}>
                    {groups.map((group, gi) => (
                        <section key={group.name} className={styles.zoneSection} aria-labelledby={`${zoneIdPrefix}-${gi}`}>
                            <header className={styles.zoneHeader}>
                                <Text as="h3" id={`${zoneIdPrefix}-${gi}`} variant="title-sm" weight={600}>
                                    {group.name}
                                </Text>
                                <Text variant="body-sm" colorVariant="muted">
                                    {group.tables.length} {group.tables.length === 1 ? "tavolo" : "tavoli"}
                                </Text>
                            </header>
                            <CardGrid aria-label={group.name}>
                                {group.tables.map(t => {
                                    const status = deriveTableStatus(t) as TableStatus;
                                    const statusLabel = STATUS_LABELS[status];
                                    const submitted = countSubmitted(t.active_orders);
                                    const activeOrdersText = formatActiveOrders(t.active_orders);

                                    const cardActions: TableRowAction[] = [
                                        {
                                            label: "Vedi dettaglio",
                                            icon: Eye,
                                            onClick: () => handleTableClick(t.id)
                                        },
                                        {
                                            label: "Chiudi tavolo",
                                            icon: LogOut,
                                            hidden: status !== "occupied" || !canManage,
                                            onClick: () => handleRequestClose(t.id)
                                        },
                                        {
                                            label: t.maintenance_mode
                                                ? "Rimetti in servizio"
                                                : "Metti fuori servizio",
                                            icon: Wrench,
                                            hidden: status === "occupied" || !canManage,
                                            onClick: () =>
                                                void handleMaintenanceToggle(t.id, !t.maintenance_mode)
                                        }
                                    ];

                                    const subtitle = [
                                        t.seats != null ? `${t.seats} ${t.seats === 1 ? "posto" : "posti"}` : null,
                                        status === "occupied" && t.session_opened_at
                                            ? `da ${formatElapsedLabel(t.session_opened_at)}`
                                            : null
                                    ]
                                        .filter(Boolean)
                                        .join(" · ");

                                    return (
                                        <CardGridItem
                                            key={t.id}
                                            title={t.label}
                                            subtitle={subtitle || undefined}
                                            badge={
                                                <span className={styles.badges}>
                                                    <StatusBadge variant={STATUS_VARIANTS[status]} label={statusLabel} />
                                                    {submitted > 0 && (
                                                        <Badge variant="brand">
                                                            {submitted} {submitted === 1 ? "nuova" : "nuove"}
                                                        </Badge>
                                                    )}
                                                    {t.bill_requested_count > 0 && (
                                                        <StatusBadge variant="warning" label="Conto richiesto" />
                                                    )}
                                                    {t.waiter_called_count > 0 && (
                                                        <StatusBadge variant="warning" label="Cameriere chiamato" />
                                                    )}
                                                </span>
                                            }
                                            actions={<TableRowActions actions={cardActions} />}
                                            footer={
                                                status === "occupied" ? (
                                                    <span className={styles.footer}>
                                                        <Text as="span" variant="body-sm" colorVariant="muted">
                                                            {activeOrdersText}
                                                        </Text>
                                                        <Text as="span" variant="body-sm" weight={600}>
                                                            {formatEur(t.current_total)}
                                                        </Text>
                                                    </span>
                                                ) : undefined
                                            }
                                            onClick={() => handleTableClick(t.id)}
                                            aria-label={`${t.label}, ${statusLabel}`}
                                        />
                                    );
                                })}
                            </CardGrid>
                        </section>
                    ))}
                </div>
            )}

            <TableDetailDrawer
                open={isDetailOpen}
                tenantId={tenantId}
                activityId={activityId}
                tableId={detailTableId}
                currentTotal={
                    detailTableId
                        ? (items.find(t => t.id === detailTableId)?.current_total ?? null)
                        : null
                }
                onClose={() => {
                    setIsDetailOpen(false);
                    setDetailTableId(null);
                }}
                onRequestClose={handleRequestClose}
                onMaintenanceChanged={() => void refetch()}
                onBillCleared={() => void refetch()}
                onStornoCreated={() => void refetch()}
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
