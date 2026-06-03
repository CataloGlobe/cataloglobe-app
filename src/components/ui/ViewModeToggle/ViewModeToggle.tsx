// ============================================================
// <ViewModeToggle>
//
// Segmented pill icon-only per lista vs griglia. Controlled
// (value + onChange). Altezza = --control-height (header band).
// Tooltip nativo + aria-label per accessibilità.
// ============================================================

import { LayoutGrid, List as ListIcon } from "lucide-react";
import { IconButton } from "@/components/ui/Button/IconButton";
import styles from "./ViewModeToggle.module.scss";

export type ViewMode = "list" | "grid";

export interface ViewModeToggleProps {
    value: ViewMode;
    onChange: (next: ViewMode) => void;
    className?: string;
    /** Etichetta del gruppo per screen reader. Default "Vista". */
    ariaLabel?: string;
}

export function ViewModeToggle({
    value,
    onChange,
    className,
    ariaLabel = "Vista"
}: ViewModeToggleProps) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={`${styles.toggle} ${className ?? ""}`}
        >
            <IconButton
                icon={<LayoutGrid size={16} />}
                aria-label="Vista griglia"
                title="Griglia"
                variant="ghost"
                size="sm"
                className={`${styles.btn} ${value === "grid" ? styles.active : ""}`}
                onClick={() => onChange("grid")}
            />
            <IconButton
                icon={<ListIcon size={16} />}
                aria-label="Vista lista"
                title="Lista"
                variant="ghost"
                size="sm"
                className={`${styles.btn} ${value === "list" ? styles.active : ""}`}
                onClick={() => onChange("list")}
            />
        </div>
    );
}
