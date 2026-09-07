import { useMemo } from "react";
import type { V2Table } from "@/types/orders";
import styles from "./TableMultiSelect.module.scss";

// Selezione multipla dei tavoli di una sede, raggruppati per zona.
//
// Nessun fetch interno: i tavoli arrivano dal chiamante (già senza i
// soft-deleted, come li dà `listTables`). L'occupazione nella finestra della
// prenotazione è calcolata dal chiamante con `reservationTableConflicts` e
// arriva come testo pronto: qui si MOSTRA, non si impedisce. L'operatore
// sceglie un tavolo occupato se vuole; il conflitto lo segnala l'agenda.
// Stessa cosa per la manutenzione: nota, non blocco.

interface Props {
    tables: V2Table[];
    /** Id dei tavoli selezionati. */
    value: string[];
    onChange: (tableIds: string[]) => void;
    /** table_id → chi lo occupa in questa fascia ("Rossi (20:30)"). */
    occupiedBy?: ReadonlyMap<string, string>;
    disabled?: boolean;
}

const NO_ZONE = "Senza zona";

function compareLabels(a: string, b: string): number {
    return a.localeCompare(b, "it", { numeric: true, sensitivity: "base" });
}

function seatsLabel(t: V2Table): string {
    const n = t.seats ?? t.max_seats;
    if (n === null) return "posti n/d";
    return n === 1 ? "1 posto" : `${n} posti`;
}

export function TableMultiSelect({ tables, value, onChange, occupiedBy, disabled }: Props) {
    const selected = useMemo(() => new Set(value), [value]);

    const groups = useMemo(() => {
        const byZone = new Map<string, V2Table[]>();
        for (const t of tables) {
            const key = t.zone_name ?? NO_ZONE;
            const list = byZone.get(key);
            if (list) list.push(t);
            else byZone.set(key, [t]);
        }
        const names = Array.from(byZone.keys()).sort((a, b) => {
            // La zona mancante va in fondo: è l'eccezione, non una zona.
            if (a === NO_ZONE) return 1;
            if (b === NO_ZONE) return -1;
            return compareLabels(a, b);
        });
        return names.map(name => ({
            name,
            tables: (byZone.get(name) ?? []).slice().sort((a, b) => compareLabels(a.label, b.label))
        }));
    }, [tables]);

    const toggle = (id: string) => {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        onChange(Array.from(next));
    };

    if (tables.length === 0) {
        return (
            <div className={styles.empty}>
                Nessun tavolo configurato per questa sede.
            </div>
        );
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.list} role="group" aria-label="Tavoli della sede">
                {groups.map(group => (
                    <div key={group.name} className={styles.zone}>
                        <div className={styles.zoneTitle}>{group.name}</div>
                        {group.tables.map(t => {
                            const checked = selected.has(t.id);
                            const occupied = occupiedBy?.get(t.id) ?? null;
                            return (
                                <label
                                    key={t.id}
                                    className={`${styles.option} ${checked ? styles.checked : ""}`}
                                >
                                    <input
                                        type="checkbox"
                                        className={styles.checkbox}
                                        checked={checked}
                                        onChange={() => toggle(t.id)}
                                        disabled={disabled}
                                    />
                                    <span className={styles.optionMain}>
                                        <span className={styles.optionLabel}>{t.label}</span>
                                        <span className={styles.optionSeats}>{seatsLabel(t)}</span>
                                        {t.maintenance_mode && (
                                            <span className={styles.optionNote}>In manutenzione</span>
                                        )}
                                    </span>
                                    {occupied && (
                                        <span className={styles.optionOccupied}>
                                            Occupato · {occupied}
                                        </span>
                                    )}
                                </label>
                            );
                        })}
                    </div>
                ))}
            </div>
            <div className={styles.footer}>
                {value.length === 0
                    ? "Nessun tavolo selezionato"
                    : value.length === 1
                      ? "1 tavolo selezionato"
                      : `${value.length} tavoli selezionati`}
            </div>
        </div>
    );
}

export default TableMultiSelect;
