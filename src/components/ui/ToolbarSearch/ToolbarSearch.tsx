// ============================================================
// <ToolbarSearch>
//
// Search della header band: wrapper sopra `SearchInput` con
// larghezza fissa (280px desktop) + altezza esterna a filo del
// cluster (--control-height) via `inputClassName` — niente
// descendant selector hack ripetuto per pagina.
// ============================================================

import { forwardRef } from "react";
import { SearchInput } from "@/components/ui/Input/SearchInput";
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
        return (
            <SearchInput
                ref={ref}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                allowClear={allowClear}
                onClear={() => onChange("")}
                containerClassName={`${styles.wrap} ${className ?? ""}`}
                inputClassName={styles.input}
            />
        );
    }
);

ToolbarSearch.displayName = "ToolbarSearch";
