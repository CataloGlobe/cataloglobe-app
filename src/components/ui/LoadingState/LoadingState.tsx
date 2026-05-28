import React from "react";
import styles from "./LoadingState.module.scss";

interface LoadingStateProps {
    message?: string;
    icon?: React.ReactNode;
    compact?: boolean;
}

export function LoadingState({
    message = "Caricamento...",
    icon,
    compact = false
}: LoadingStateProps) {
    return (
        <div
            className={`${styles.wrapper} ${compact ? styles.compact : ""}`}
            role="status"
            aria-live="polite"
        >
            {icon ?? <div className={styles.spinner} aria-hidden="true" />}
            <p className={styles.message}>{message}</p>
        </div>
    );
}
