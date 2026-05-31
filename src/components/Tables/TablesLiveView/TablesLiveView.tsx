import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid2X2 } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";

import { useToast } from "@/context/Toast/ToastContext";
import { listTablesWithState } from "@/services/supabase/tables";
import type { V2TableWithState } from "@/types/orders";

import styles from "./TablesLiveView.module.scss";

export interface TablesLiveViewProps {
    tenantId: string;
    activityId: string;
    autoRefreshMs?: number;
}

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
    // Placeholder semplice: tempo trascorso reale richiede customer_session.created_at
    // (out of scope view aggregata listTablesWithState). Per ora: "in corso" se occupato.
    return sessionsCount > 0 ? "in corso" : "";
}

export function TablesLiveView({
    tenantId,
    activityId,
    autoRefreshMs = 30_000
}: TablesLiveViewProps) {
    const { showToast } = useToast();
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

    const loadData = useCallback(async () => {
        if (!tenantId || !activityId) {
            setItems([]);
            setIsLoading(false);
            return;
        }
        try {
            const data = await listTablesWithState(tenantId, activityId);
            setItems(data);
        } catch {
            showToast({ message: "Impossibile caricare i tavoli", type: "error" });
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId, showToast]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    useEffect(() => {
        if (!autoRefreshMs) return;
        const id = setInterval(() => {
            void loadData();
        }, autoRefreshMs);
        return () => clearInterval(id);
    }, [loadData, autoRefreshMs]);

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
                                    return (
                                        <article
                                            key={t.id}
                                            className={`${styles.card} ${styles[`card_${status}`]}`}
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
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
