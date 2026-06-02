// ============================================================
// <SedeScopeSelect> — UI consumer di useSedeScope().
//
// Riusa lo stile del componente `Select` (no nuove style rules,
// pochi override di larghezza per la barra navbar). Auto-nasconde
// se l'utente ha 1 sola sede leggibile (`isForcedSingleSite`)
// oppure nessuna sede (placeholder inutile).
//
// NON viene montato in questa fase. Viene fornito come building
// block per il mount successivo in AppHeader.
// ============================================================

import { useCallback } from "react";
import { Select } from "@/components/ui/Select/Select";
import { useSedeScope, SCOPE_ALL, type SedeScopeValue } from "@/hooks/useSedeScope";
import styles from "./SedeScopeSelect.module.scss";

export interface SedeScopeSelectProps {
    /** Classe opzionale sul wrapper esterno (per posizionamento in AppHeader). */
    className?: string;
    /** Label aria-label per accessibilità (default: "Sede attiva"). */
    ariaLabel?: string;
}

export function SedeScopeSelect({ className, ariaLabel = "Sede attiva" }: SedeScopeSelectProps) {
    const { value, setValue, readableActivities, isForcedSingleSite } = useSedeScope();

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLSelectElement>) => {
            setValue(e.target.value as SedeScopeValue);
        },
        [setValue]
    );

    // Nascondi quando il selettore non aggiunge valore: una sola sede
    // (forzata) oppure zero sedi leggibili.
    if (isForcedSingleSite || readableActivities.length === 0) {
        return null;
    }

    return (
        <div className={`${styles.wrap} ${className ?? ""}`}>
            <Select
                aria-label={ariaLabel}
                value={value}
                onChange={handleChange}
                containerClassName={styles.container}
                options={[
                    { value: SCOPE_ALL, label: "Tutte le sedi" },
                    ...readableActivities.map(a => ({ value: a.id, label: a.name }))
                ]}
            />
        </div>
    );
}
