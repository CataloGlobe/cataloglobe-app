// ============================================================
// <ToolbarSearch>
//
// Search della header band: wrapper sopra `SearchInput` con
// larghezza fissa (280px desktop) + altezza esterna a filo del
// cluster (--control-height) via `inputClassName` — niente
// descendant selector hack ripetuto per pagina.
//
// Il valore digitato è posseduto QUI, non dalla prop: `value` arriva
// dal context della testata un render in ritardo, e un controllato
// puro perdeva una lettera su due. Vedi `ownedSearchValue.ts`.
// ============================================================

import { forwardRef } from "react";
import { SearchInput } from "@/components/ui/Input/SearchInput";
import { useOwnedSearchValue } from "./ownedSearchValue";
import styles from "./ToolbarSearch.module.scss";

export interface ToolbarSearchProps {
    value: string;
    onChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    /** Mostra il pulsante clear quando c'è valore. Default true. */
    allowClear?: boolean;
}

export const ToolbarSearch = forwardRef<HTMLInputElement, ToolbarSearchProps>(
    ({ value, onChange, placeholder, className, allowClear = true }, ref) => {
        const [typed, setTyped] = useOwnedSearchValue(value, onChange);
        return (
            <SearchInput
                ref={ref}
                value={typed}
                onChange={e => setTyped(e.target.value)}
                placeholder={placeholder}
                allowClear={allowClear}
                onClear={() => setTyped("")}
                containerClassName={`${styles.wrap} ${className ?? ""}`}
                inputClassName={styles.input}
            />
        );
    }
);

ToolbarSearch.displayName = "ToolbarSearch";
