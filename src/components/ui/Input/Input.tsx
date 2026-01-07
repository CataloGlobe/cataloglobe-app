import React from "react";
import Text from "@components/ui/Text/Text";
import styles from "./Input.module.scss";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;

    /** Icona azione inline (es. +, search, enter) */
    actionIcon?: React.ReactNode;
    onActionClick?: () => void;
}

export const Input: React.FC<InputProps> = ({
    label,
    error,
    id,
    className,
    actionIcon,
    onActionClick,
    ...props
}) => {
    const inputId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined);

    return (
        <div className={`${styles.wrapper} ${className || ""}`}>
            {/* LABEL */}
            {label && (
                <Text as="label" variant="body" weight={600} className={styles.label}>
                    {label}
                </Text>
            )}

            {/* INPUT + ACTION */}
            <div className={styles.inputWrapper}>
                <input id={inputId} className={styles.input} aria-invalid={!!error} {...props} />

                {actionIcon && onActionClick && (
                    <button
                        type="button"
                        className={styles.inputAction}
                        onClick={onActionClick}
                        aria-label="Azione input"
                        tabIndex={-1}
                    >
                        {actionIcon}
                    </button>
                )}
            </div>

            {/* ERROR */}
            {error && (
                <Text as="span" variant="caption" colorVariant="error" className={styles.error}>
                    {error}
                </Text>
            )}
        </div>
    );
};
