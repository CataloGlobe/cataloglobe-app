import React, { useId, useMemo } from "react";
import Text from "@components/ui/Text/Text";
import styles from "./InputBase.module.scss";

type RenderArgs = {
    inputId: string;
    describedById?: string;
    hasError: boolean;
    isDisabled: boolean;
};

export type InputBaseProps = {
    id?: string;

    label?: string;
    helperText?: string;
    error?: string;

    required?: boolean;
    disabled?: boolean;

    className?: string;

    /**
     * Render prop: qui dentro renderizzi TU l'input (o select, ecc.)
     * e applichi id / aria-describedby / aria-invalid / disabled.
     */
    children: (args: RenderArgs) => React.ReactNode;
};

export const InputBase: React.FC<InputBaseProps> = ({
    id,
    label,
    helperText,
    error,
    required = false,
    disabled = false,
    className,
    children
}) => {
    const reactId = useId();
    const inputId = id ?? `input-${reactId}`;

    const hasError = Boolean(error);
    const isDisabled = Boolean(disabled);

    const helperId = helperText ? `${inputId}-help` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;

    const describedById = useMemo(() => {
        // Ordine: helper prima, error dopo (così lo screen reader legge il contesto e poi l’errore)
        const ids = [helperId, errorId].filter(Boolean);
        return ids.length ? ids.join(" ") : undefined;
    }, [helperId, errorId]);

    return (
        <div
            className={`${styles.wrapper} ${className ?? ""}`}
            data-disabled={isDisabled || undefined}
        >
            {/* LABEL */}
            {label && (
                <Text
                    as="label"
                    variant="caption"
                    weight={600}
                    className={styles.label}
                    htmlFor={inputId}
                >
                    {label}
                    {required && (
                        <Text
                            as="span"
                            variant="caption"
                            className={styles.required}
                            aria-hidden="true"
                        >
                            {" *"}
                        </Text>
                    )}
                </Text>
            )}

            {/* CONTROL */}
            <div className={styles.control}>
                {children({
                    inputId,
                    describedById,
                    hasError,
                    isDisabled
                })}
            </div>

            {/* HELPER */}
            {helperText && !error && (
                <Text as="span" id={helperId} variant="caption" className={styles.helper}>
                    {helperText}
                </Text>
            )}

            {/* ERROR */}
            {error && (
                <Text
                    as="span"
                    id={errorId}
                    variant="caption"
                    colorVariant="error"
                    className={styles.error}
                    role="alert"
                >
                    {error}
                </Text>
            )}
        </div>
    );
};
