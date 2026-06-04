// ============================================================
// <SedeScopeSelect> — UI consumer di useSedeScope().
//
// Implementato come button + dropdown custom (non `<select>`)
// per matchare visivamente la pill del tenant switcher in navbar
// (stesso chevron `ChevronsUpDown`, stesso padding/border/radius/
// typography). Logica intatta: legge/scrive `useSedeScope`.
//
// Auto-nasconde se l'utente ha 1 sola sede leggibile o nessuna
// (selettore non aggiunge valore).
// ============================================================

import { useEffect, useRef, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { useSedeScope, SCOPE_ALL, type SedeScopeValue } from "@/hooks/useSedeScope";
import styles from "./SedeScopeSelect.module.scss";

export interface SedeScopeSelectProps {
    /** Classe opzionale sul wrapper esterno (per posizionamento in AppHeader). */
    className?: string;
    /** Label aria-label per accessibilità (default: "Sede attiva"). */
    ariaLabel?: string;
    /** Se `false`, l'opzione "Tutte le sedi" (SCOPE_ALL) non viene renderizzata.
     *  Default `true` (backward-compat con le 4 route esistenti). */
    allowAll?: boolean;
}

const ALL_LABEL = "Tutte le sedi";

export function SedeScopeSelect({ className, ariaLabel = "Sede attiva", allowAll = true }: SedeScopeSelectProps) {
    const { value, setValue, readableActivities, isForcedSingleSite } = useSedeScope();
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    // Click-outside + Escape per chiudere il menu (parità con HeaderTenantSwitcher).
    useEffect(() => {
        if (!open) return;
        const handleMouseDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        document.addEventListener("mousedown", handleMouseDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("mousedown", handleMouseDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open]);

    // Nascondi quando il selettore non aggiunge valore: una sola sede
    // (forzata) oppure zero sedi leggibili.
    if (isForcedSingleSite || readableActivities.length === 0) {
        return null;
    }

    const currentLabel =
        value === SCOPE_ALL
            ? ALL_LABEL
            : (readableActivities.find(a => a.id === value)?.name ?? ALL_LABEL);

    const handleSelect = (next: SedeScopeValue) => {
        setValue(next);
        setOpen(false);
    };

    return (
        <div className={`${styles.wrap} ${className ?? ""}`} ref={wrapperRef}>
            <button
                type="button"
                className={styles.button}
                aria-label={ariaLabel}
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen(v => !v)}
            >
                <span className={styles.label}>{currentLabel}</span>
                <ChevronsUpDown size={13} className={styles.chevron} />
            </button>

            {open && (
                <div className={styles.list} role="menu">
                    {allowAll && (
                        <button
                            type="button"
                            role="menuitem"
                            className={styles.row}
                            onClick={() => handleSelect(SCOPE_ALL)}
                        >
                            <span className={styles.checkSlot}>
                                {value === SCOPE_ALL && <Check size={14} />}
                            </span>
                            <span
                                className={styles.rowName}
                                data-active={value === SCOPE_ALL ? "true" : undefined}
                            >
                                {ALL_LABEL}
                            </span>
                        </button>
                    )}
                    {readableActivities.map(a => {
                        const isSelected = value === a.id;
                        return (
                            <button
                                key={a.id}
                                type="button"
                                role="menuitem"
                                className={styles.row}
                                onClick={() => handleSelect(a.id)}
                            >
                                <span className={styles.checkSlot}>
                                    {isSelected && <Check size={14} />}
                                </span>
                                <span
                                    className={styles.rowName}
                                    data-active={isSelected ? "true" : undefined}
                                >
                                    {a.name}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
