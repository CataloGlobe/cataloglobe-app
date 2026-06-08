import { useMemo } from "react";

import type { V2TableWithState } from "@/types/orders";
import { deriveTableStatus } from "@/utils/tableState";

import styles from "./TableSelect.module.scss";

const NO_ZONE_KEY = "__no_zone__";
const NO_ZONE_LABEL = "Senza zona";

export interface SelectedTable {
    id: string;
    label: string;
}

export interface TableSelectProps {
    tables: V2TableWithState[];
    isLoading: boolean;
    error: string | null;
    value: string | null;
    onChange: (next: SelectedTable | null) => void;
}

function tableOptionLabel(t: V2TableWithState): string {
    const parts: string[] = [t.label];
    if (t.zone_name) parts.push(t.zone_name);
    if (t.seats != null) {
        parts.push(`${t.seats} ${t.seats === 1 ? "posto" : "posti"}`);
    }
    const status = deriveTableStatus(t);
    if (status === "occupied") parts.push("(occupato)");
    return parts.join(" · ");
}

export function TableSelect({
    tables,
    isLoading,
    error,
    value,
    onChange
}: TableSelectProps) {
    // Filtra fuori maintenance e soft-deleted. Occupied selezionabili
    // (comanda cumulativa via order_group aperto lato server).
    const selectable = useMemo(
        () => tables.filter(t => !t.maintenance_mode && t.deleted_at == null),
        [tables]
    );

    // Raggruppa per zona; no-zone bucket per ultimo.
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

    function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
        const next = e.target.value;
        if (!next) {
            onChange(null);
            return;
        }
        const t = selectable.find(x => x.id === next);
        if (!t) {
            onChange(null);
            return;
        }
        onChange({ id: t.id, label: t.label });
    }

    // Stati possibili (lo stesso markup li copre, cambia solo il testo del
    // placeholder e `disabled` → zero layout shift sotto la select):
    //   - loading           → "Caricamento tavoli..."  + disabled
    //   - error             → "Errore caricamento tavoli" + disabled
    //   - empty (no tavoli) → "Nessun tavolo disponibile" + disabled
    //   - ready             → "Seleziona un tavolo..."   + enabled
    let placeholderText: string;
    let isDisabled: boolean;
    if (isLoading) {
        placeholderText = "Caricamento tavoli...";
        isDisabled = true;
    } else if (error != null) {
        placeholderText = "Errore caricamento tavoli";
        isDisabled = true;
    } else if (selectable.length === 0) {
        placeholderText = "Nessun tavolo disponibile";
        isDisabled = true;
    } else {
        placeholderText = "Seleziona un tavolo...";
        isDisabled = false;
    }

    return (
        <div className={styles.wrapper}>
            <select
                id="create-order-table-select"
                aria-label="Tavolo"
                className={styles.select}
                value={value ?? ""}
                onChange={handleChange}
                disabled={isDisabled}
                required
            >
                <option value="" disabled>
                    {placeholderText}
                </option>
                {groups.map(g => (
                    <optgroup key={g.name} label={g.name}>
                        {g.tables.map(t => (
                            <option key={t.id} value={t.id}>
                                {tableOptionLabel(t)}
                            </option>
                        ))}
                    </optgroup>
                ))}
            </select>
        </div>
    );
}
