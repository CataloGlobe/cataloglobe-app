import React, { forwardRef } from "react";
import { InputBase } from "./InputBase";
import styles from "./TextInput.module.scss";

export type ColorInputProps = {
    id?: string;
    label?: string;
    helperText?: string;
    error?: string;
    required?: boolean;
    disabled?: boolean;

    value: string;
    onChange: (color: string) => void;

    allowTextInput?: boolean;

    containerClassName?: string;
    inputClassName?: string;
};

export const ColorInput = forwardRef<HTMLInputElement, ColorInputProps>(
    (
        {
            id,
            label,
            helperText,
            error,
            required,
            disabled,

            value,
            onChange,
            allowTextInput = true,

            containerClassName,
            inputClassName
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
                    <div
                        className={`${styles.inputShell} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.isDisabled : ""
                        }`}
                    >
                        {/* COLOR PREVIEW */}
                        <label
                            htmlFor={`${inputId}-picker`}
                            className={styles.startAdornment}
                            style={{
                                cursor: isDisabled ? "not-allowed" : "pointer"
                            }}
                        >
                            <span
                                style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: 4,
                                    backgroundColor: value,
                                    border: "1px solid var(--border, #cbd5e1)"
                                }}
                            />
                        </label>

                        {/* TEXT INPUT (HEX) */}
                        {allowTextInput && (
                            <input
                                ref={ref}
                                id={inputId}
                                type="text"
                                value={value}
                                disabled={isDisabled}
                                aria-invalid={hasError}
                                aria-describedby={describedById}
                                className={`${styles.input} ${inputClassName ?? ""}`}
                                onChange={e => onChange(e.target.value)}
                            />
                        )}

                        {/* HIDDEN COLOR PICKER */}
                        <input
                            id={`${inputId}-picker`}
                            type="color"
                            value={value}
                            disabled={isDisabled}
                            onChange={e => onChange(e.target.value)}
                            className={styles.colorPicker}
                        />
                    </div>
                )}
            </InputBase>
        );
    }
);

ColorInput.displayName = "ColorInput";
