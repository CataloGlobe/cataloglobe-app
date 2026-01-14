import React, { forwardRef } from "react";
import { InputBase } from "./InputBase";
import styles from "./TextInput.module.scss";

export type TimeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    label?: string;
    helperText?: string;
    error?: string;

    startAdornment?: React.ReactNode;
    endAdornment?: React.ReactNode;
    endAdornmentAriaLabel?: string;
    onEndAdornmentClick?: () => void;

    containerClassName?: string;
    inputClassName?: string;
};

export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(
    (
        {
            id,
            label,
            helperText,
            error,
            required,
            disabled,

            startAdornment,
            endAdornment,
            endAdornmentAriaLabel = "Azione input",
            onEndAdornmentClick,

            containerClassName,
            inputClassName,
            className,
            ...props
        },
        ref
    ) => {
        const hasEndAction = Boolean(endAdornment && onEndAdornmentClick);

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
                    <div
                        className={`${styles.inputShell} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.isDisabled : ""
                        }`}
                    >
                        {startAdornment && (
                            <div className={styles.startAdornment}>{startAdornment}</div>
                        )}

                        <input
                            ref={ref}
                            id={inputId}
                            type="time"
                            disabled={isDisabled}
                            aria-invalid={hasError}
                            aria-describedby={describedById}
                            className={`${styles.input} ${inputClassName ?? className ?? ""}`}
                            {...props}
                        />

                        {endAdornment && !hasEndAction && (
                            <div className={styles.endAdornment}>{endAdornment}</div>
                        )}

                        {endAdornment && hasEndAction && (
                            <button
                                type="button"
                                className={styles.endAction}
                                onClick={onEndAdornmentClick}
                                aria-label={endAdornmentAriaLabel}
                            >
                                {endAdornment}
                            </button>
                        )}
                    </div>
                )}
            </InputBase>
        );
    }
);

TimeInput.displayName = "TimeInput";
