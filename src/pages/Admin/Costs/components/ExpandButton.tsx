import { Maximize, Minimize } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip/Tooltip";
import styles from "../Costs.module.scss";

/**
 * «Allarga» di un riquadro (Alex, 2026-10-16, come in Servizio di Gea): il
 * riquadro passa a tutta larghezza e mostra tutto; di nuovo, torna piccolo.
 */
export function ExpandButton({ expanded, onToggle, what }: { expanded: boolean; onToggle: () => void; what: string }) {
    const label = expanded ? "Riduci" : "Allarga";
    return (
        <Tooltip content={label} side="top">
            <span className={styles.tipWrap}>
                <button
                    type="button"
                    className={styles.expandBtn}
                    aria-expanded={expanded}
                    aria-label={`${label}: ${what}`}
                    onClick={onToggle}
                >
                    {expanded ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
                </button>
            </span>
        </Tooltip>
    );
}
