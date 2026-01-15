import React, { forwardRef } from "react";
import { InputBase } from "../Input/InputBase";
import styles from "./Textarea.module.scss";

export type TextareaProps = Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
    label?: string;
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
            </InputBase>
        );
    }
);

Textarea.displayName = "Textarea";
