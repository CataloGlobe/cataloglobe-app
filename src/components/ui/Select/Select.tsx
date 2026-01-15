import React, { forwardRef } from "react";
import { InputBase } from "../Input/InputBase";
import styles from "./Select.module.scss";

export interface SelectOption {
    value: string;
    label: string;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
    label?: string;
    helperText?: string;
    error?: string;
    options?: SelectOption[];
    children?: React.ReactNode;

    containerClassName?: string;
    selectClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    (
        {
            id,
            label,
            helperText,
            error,
            required,
            disabled,
            options,
            children,
            containerClassName,
            selectClassName,
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
                    <div
                        className={`${styles.selectWrapper} ${hasError ? styles.hasError : ""} ${
                            isDisabled ? styles.disabled : ""
                        }`}
                    >
                        <select
                            ref={ref}
                            id={inputId}
                            disabled={isDisabled}
                            aria-invalid={hasError}
                            aria-describedby={describedById}
                            className={`${styles.select} ${selectClassName ?? className ?? ""}`}
                            {...props}
                        >
                            {options
                                ? options.map(opt => (
                                      <option key={opt.value} value={opt.value}>
                                          {opt.label}
                                      </option>
                                  ))
                                : children}
                        </select>

                        <div className={styles.caret} aria-hidden="true">
                            ▾
                        </div>
                    </div>
                )}
            </InputBase>
        );
    }
);

Select.displayName = "Select";
