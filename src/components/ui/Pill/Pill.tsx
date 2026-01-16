import { memo } from "react";
import clsx from "clsx";
import styles from "./Pill.module.scss";
import Text from "../Text/Text";

export type PillShape = "pill" | "rounded" | "square" | "circle";

export interface PillProps {
    label: string;
    active?: boolean;
    disabled?: boolean;
    shape?: PillShape;
    onClick?: () => void;
    ariaLabel?: string;
    className?: string;
}

export const Pill = memo(function Pill({
    label,
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
            <Text variant="caption" weight={600}>
                {label}
            </Text>
        </button>
    );
});
