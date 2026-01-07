import React from "react";
import styles from "./Loader.module.scss";

export type LoaderSize = "sm" | "md" | "lg";

export interface LoaderProps {
    size?: LoaderSize;
    fullscreen?: boolean;
    className?: string;
    ariaLabel?: string;
}

export const Loader: React.FC<LoaderProps> = ({
    size = "md",
    fullscreen = false,
    className,
    ariaLabel = "Caricamento in corso"
}) => {
    const sizeClass =
        size === "sm" ? styles.loaderSm : size === "lg" ? styles.loaderLg : styles.loaderMd;

    const spinner = (
        <div
            className={`${styles.loaderSpinner} ${sizeClass} ${className ?? ""}`.trim()}
            role="status"
            aria-label={ariaLabel}
        >
            <span className={styles.visuallyHidden}>{ariaLabel}</span>
        </div>
    );

    if (!fullscreen) {
        return spinner;
    }

    return <div className={styles.fullscreenOverlay}>{spinner}</div>;
};
