import { memo, type ReactNode } from "react";
import clsx from "clsx";
import { Check, X } from "lucide-react";
import Text from "../Text/Text";
import styles from "./Chip.module.scss";

/**
 * Chip — scheda «Chip» del design system (§5). Era `Pill`: `ui/Pill` e
 * `ui/PillGroup` restano come re-export deprecati con le stesse props.
 *
 * Un token che si sceglie, si toglie o si ordina. Lo stato `selected`
 * (alias storico `active`) porta fondo, bordo, testo brand **e** la spunta:
 * mai solo il colore.
 */

/** @deprecated Solo `pill` è nel sistema; le altre forme si tolgono nel lotto 6. */
export type ChipShape = "pill" | "rounded" | "square" | "circle";

export interface ChipProps {
    label: string;
    /** Icona a sinistra del label (eredita currentColor, es. lucide-react). */
    icon?: ReactNode;
    /** Selezionato: fondo brand-primary-soft, bordo e testo brand, spunta. */
    selected?: boolean;
    /** @deprecated Alias di `selected` (nome storico di Pill). */
    active?: boolean;
    disabled?: boolean;
    /** Conteggio accanto al label, in grassetto (filtri coi conteggi a vista). */
    count?: number;
    /** `warning`: il chip nomina un difetto (fondo e testo ambra). */
    tone?: "warning";
    /** @deprecated Solo `pill` è nel sistema. */
    shape?: ChipShape;
    onClick?: () => void;
    /** Rimovibile: mostra la × a destra. */
    onRemove?: () => void;
    removeLabel?: string;
    ariaLabel?: string;
    className?: string;
}

export const Chip = memo(function Chip({
    label,
    icon,
    selected,
    active = false,
    disabled = false,
    count,
    tone,
    shape = "pill",
    onClick,
    onRemove,
    removeLabel = "Rimuovi",
    ariaLabel,
    className
}: ChipProps) {
    const isSelected = selected ?? active;
    const removable = Boolean(onRemove);

    const body = (
        <>
            {isSelected && (
                <span className={styles.check} aria-hidden>
                    <Check size={14} strokeWidth={2.5} />
                </span>
            )}
            {icon && !isSelected && (
                <span className={styles.icon} aria-hidden>
                    {icon}
                </span>
            )}
            <Text as="span" variant="caption" weight={500} className={styles.label}>
                {label}
            </Text>
            {count !== undefined && (
                <Text as="span" variant="caption" weight={700} className={styles.label}>
                    {count}
                </Text>
            )}
        </>
    );

    const classes = clsx(
        styles.chip,
        styles[shape],
        tone === "warning" && styles.warning,
        disabled && styles.disabled,
        removable && styles.removable,
        className
    );

    if (removable) {
        // Un bottone non può contenere un altro bottone: il chip rimovibile è
        // uno span con dentro l'eventuale azione di selezione e la ×.
        return (
            <span className={classes} aria-pressed={isSelected || undefined} aria-disabled={disabled || undefined}>
                {onClick ? (
                    <button type="button" className={styles.inner} onClick={onClick} disabled={disabled} aria-pressed={isSelected}>
                        {body}
                    </button>
                ) : (
                    body
                )}
                <button
                    type="button"
                    className={styles.remove}
                    onClick={onRemove}
                    disabled={disabled}
                    aria-label={`${removeLabel} ${ariaLabel ?? label}`}
                >
                    <X size={14} />
                </button>
            </span>
        );
    }

    return (
        <button
            type="button"
            className={classes}
            aria-checked={isSelected}
            aria-label={ariaLabel ?? (count !== undefined ? `${label} ${count}` : label)}
            disabled={disabled}
            onClick={onClick}
        >
            {body}
        </button>
    );
});

export default Chip;
