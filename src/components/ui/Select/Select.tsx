import React, { forwardRef } from "react";
import { InputBase } from "../Input/InputBase";
import styles from "./Select.module.scss";

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "size"> {
    label?: string;
    tooltip?: React.ReactNode;
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
            tooltip,
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
                tooltip={tooltip}
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
                                      <option key={opt.value} value={opt.value} disabled={opt.disabled}>
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
