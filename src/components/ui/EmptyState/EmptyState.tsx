import React from "react";
import styles from "./EmptyState.module.scss";

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    compact?: boolean;
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    compact = false
}: EmptyStateProps) {
    return (
        <div className={`${styles.wrapper} ${compact ? styles.compact : ""}`}>
            <div className={styles.icon}>{icon}</div>
            <h3 className={styles.title}>{title}</h3>
            {description && <p className={styles.description}>{description}</p>}
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}
