import { useCallback, useEffect, useMemo, useState } from "react";
import { Grid2X2, AlertCircle } from "lucide-react";

import Text from "@/components/ui/Text/Text";
import { Button } from "@/components/ui/Button/Button";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";

import { listTablesWithState } from "@/services/supabase/tables";
import type { V2TableWithState } from "@/types/orders";
import { deriveTableStatus } from "@/utils/tableState";

import styles from "./TablePicker.module.scss";

const NO_ZONE_KEY = "__no_zone__";
const NO_ZONE_LABEL = "Senza zona";

export interface TablePickerProps {
    tenantId: string;
    activityId: string;
    onSelect: (table: { id: string; label: string }) => void;
}

export function TablePicker({ tenantId, activityId, onSelect }: TablePickerProps) {
    const [items, setItems] = useState<V2TableWithState[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await listTablesWithState(tenantId, activityId);
            setItems(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Errore caricamento tavoli");
        } finally {
            setIsLoading(false);
        }
    }, [tenantId, activityId]);

    useEffect(() => {
        void load();
    }, [load]);

    // Filtra fuori maintenance e soft-deleted. Tavoli occupied restano
    // selezionabili: comanda cumulativa, fusione con order_group aperto.
    const selectable = useMemo(
        () =>
            items.filter(
                t => !t.maintenance_mode && t.deleted_at == null
            ),
        [items]
    );

    const groups = useMemo(() => {
        const byZone = new Map<string, { name: string; tables: V2TableWithState[] }>();
        for (const t of selectable) {
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
    }, [selectable]);

    if (isLoading && items.length === 0) {
        return (
            <div className={styles.loading}>
                <Text colorVariant="muted">Caricamento tavoli...</Text>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorBlock}>
                <EmptyState
                    icon={<AlertCircle size={40} strokeWidth={1.5} />}
                    title="Errore"
                    description={error}
                    action={
                        <Button variant="secondary" onClick={() => void load()}>
                            Riprova
                        </Button>
                    }
                />
            </div>
        );
    }

    if (selectable.length === 0) {
        return (
            <EmptyState
                icon={<Grid2X2 size={40} strokeWidth={1.5} />}
                title="Nessun tavolo disponibile"
                description="Tutti i tavoli sono in manutenzione o non configurati. Verifica la sede selezionata."
            />
        );
    }

    return (
        <div className={styles.wrapper}>
            {groups.map(group => (
                <section key={group.name} className={styles.zoneSection}>
                    <header className={styles.zoneHeader}>
                        <Text variant="title-sm" weight={600} className={styles.zoneName}>
                            {group.name}
                        </Text>
                        <Text variant="body-sm" colorVariant="muted" className={styles.zoneCount}>
                            {group.tables.length}{" "}
                            {group.tables.length === 1 ? "tavolo" : "tavoli"}
                        </Text>
                    </header>
                    <div className={styles.cardsGrid}>
                        {group.tables.map(t => {
                            const status = deriveTableStatus(t);
                            const cardClass =
                                status === "occupied" ? styles.cardOccupied : styles.card;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    className={cardClass}
                                    onClick={() => onSelect({ id: t.id, label: t.label })}
                                >
                                    <div className={styles.cardHeader}>
                                        <span className={styles.cardLabel}>{t.label}</span>
                                        {status === "occupied" ? (
                                            <StatusBadge variant="success" label="Occupato" />
                                        ) : (
                                            <StatusBadge variant="neutral" label="Libero" />
                                        )}
                                    </div>
                                    {t.seats != null && (
                                        <span className={styles.cardMeta}>
                                            {t.seats}{" "}
                                            {t.seats === 1 ? "posto" : "posti"}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
