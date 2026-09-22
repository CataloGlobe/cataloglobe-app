import React from "react";
import styles from "./StatusBadge.module.scss";

/**
 * `success · neutral · warning · danger · info` sono le varianti della scheda.
 * `pending` è confluita in `warning` (stessa resa): resta accettata come alias,
 * si toglie nel lotto 6.
 */
export type StatusBadgeVariant =
    | "success"
    | "neutral"
    | "warning"
    | "danger"
    | "info"
    | "pending";

export interface StatusBadgeProps {
    variant: StatusBadgeVariant;
    label: string;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    variant,
    label,
    className
}) => {
    const resolved = variant === "pending" ? "warning" : variant;
    return (
        <span
            className={`${styles.badge} ${styles[resolved]} ${className ?? ""}`}
            aria-label={label}
            data-pill=""
        >
            <span className={styles.dot} aria-hidden />
            <span className={styles.label}>{label}</span>
        </span>
    );
};

export default StatusBadge;
