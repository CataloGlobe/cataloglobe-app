import React, { forwardRef } from "react";
import { InputBase } from "./InputBase";
import Text from "@components/ui/Text/Text";
import styles from "./CheckboxInput.module.scss";

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    label?: string;
    helperText?: string;
    error?: string;

    /** Testo opzionale a destra del checkbox */
    description?: string;

    containerClassName?: string;
};

export const CheckboxInput = forwardRef<HTMLInputElement, CheckboxProps>(
    (
        {
            id,
            label,
            description,
            helperText,
            error,
            required,
            disabled,
            containerClassName,
            className,
            ...props
        },
        ref
    ) => {
        return (
            <InputBase
                id={id}
                label={label}
                helperText={helperText}
                error={error}
                required={required}
                disabled={disabled}
                className={containerClassName}
            >
                {({ inputId, describedById, hasError, isDisabled }) => (
                    <label
                        htmlFor={inputId}
                        className={`${styles.wrapper} ${className ?? ""} ${
                            isDisabled ? styles.disabled : ""
                        }`}
                    >
                        <input
                            ref={ref}
                            id={inputId}
                            type="checkbox"
                            disabled={isDisabled}
                            aria-invalid={hasError}
                            aria-describedby={describedById}
                            className={styles.input}
                            {...props}
                        />

                        <span className={styles.box} aria-hidden="true" />

                        {description && (
                            <Text
                                as="span"
                                variant="caption"
                                color="#94a3b8"
                                className={styles.description}
                            >
                                {description}
                            </Text>
                        )}
                    </label>
                )}
            </InputBase>
        );
    }
);

CheckboxInput.displayName = "CheckboxInput";
