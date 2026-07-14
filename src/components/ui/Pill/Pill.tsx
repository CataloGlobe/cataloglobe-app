import { memo, type ReactNode } from "react";
import clsx from "clsx";
import styles from "./Pill.module.scss";
import Text from "../Text/Text";

export type PillShape = "pill" | "rounded" | "square" | "circle";

export interface PillProps {
    label: string;
    /** Icona a sinistra del label (eredita currentColor, es. lucide-react). */
    icon?: ReactNode;
    active?: boolean;
    disabled?: boolean;
    shape?: PillShape;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
}

export const Pill = memo(function Pill({
    label,
    icon,
    active = false,
    disabled = false,
    shape = "pill",
    onClick,
    ariaLabel,
    className
}: PillProps) {
    return (
        <button
            type="button"
            className={clsx(styles.pill, styles[shape], disabled && styles.disabled, className)}
            aria-checked={active}
            aria-label={ariaLabel ?? label}
            disabled={disabled}
            onClick={onClick}
        >
            {icon && (
                <span className={styles.icon} aria-hidden>
                    {icon}
                </span>
            )}
            <Text variant="caption" weight={600}>
                {label}
            </Text>
        </button>
    );
});
