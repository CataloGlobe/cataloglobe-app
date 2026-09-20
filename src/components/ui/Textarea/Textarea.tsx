import React, { forwardRef } from "react";
import { FormField } from "../FormField/FormField";
import styles from "./Textarea.module.scss";

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
    label?: string;
    tooltip?: React.ReactNode;
    helperText?: string;
    error?: string;

    containerClassName?: string;
    textareaClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    (
        {
            id,
            label,
            tooltip,
            helperText,
            error,
            required,
            disabled,

            containerClassName,
            textareaClassName,
            className,
            rows = 4,

            ...props
        },
        ref
    ) => {
        return (
            <FormField
                id={id}
                label={label}
                tooltip={tooltip}
                helperText={helperText}
                error={error}
                required={required}
                disabled={disabled}
                className={containerClassName}
            >
                {({ inputId, describedById, hasError, isDisabled }) => (
                    <textarea
                        ref={ref}
                        id={inputId}
                        rows={rows}
                        disabled={isDisabled}
                        aria-invalid={hasError}
                        aria-describedby={describedById}
                        className={`${styles.textarea} ${hasError ? styles.hasError : ""} ${
                            textareaClassName ?? className ?? ""
                        }`}
                        {...props}
                    />
                )}
            </FormField>
        );
    }
);

Textarea.displayName = "Textarea";
