import React from "react";
import styles from "./StatusBadge.module.scss";

export type StatusBadgeVariant = "success" | "neutral";

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
    return (
        <span
            className={`${styles.badge} ${styles[variant]} ${className ?? ""}`}
            aria-label={label}
        >
            <span className={styles.dot} aria-hidden />
            <span className={styles.label}>{label}</span>
        </span>
    );
};

export default StatusBadge;
