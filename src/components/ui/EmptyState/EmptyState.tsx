import React from "react";
import styles from "./EmptyState.module.scss";

type EmptyStateVariant = "default" | "inline";

interface EmptyStateProps {
    icon: React.ReactNode;
    title: string;
    description?: string;
    action?: React.ReactNode;
    compact?: boolean;
    variant?: EmptyStateVariant;
}

export function EmptyState({
    icon,
    title,
    description,
    action,
    compact = false,
    variant = "default"
}: EmptyStateProps) {
    if (variant === "inline") {
        return (
            <div className={styles.inline}>
                <p className={styles.inlineText}>{description ?? title}</p>
                {action && <div className={styles.inlineAction}>{action}</div>}
            </div>
        );
    }

    return (
        <div className={`${styles.wrapper} ${compact ? styles.compact : ""}`}>
            <div className={styles.icon}>{icon}</div>
            <h3 className={styles.title}>{title}</h3>
            {description && <p className={styles.description}>{description}</p>}
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}
