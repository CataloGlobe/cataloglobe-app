import React, { forwardRef } from "react";
import { InputBase } from "./InputBase";
import Text from "@components/ui/Text/Text";
import styles from "./RangeInput.module.scss";

export type RangeInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    label?: string;
    helperText?: string;
    error?: string;

    /** Mostra il valore corrente accanto allo slider */
    showValue?: boolean;

    /** Formatter opzionale del valore */
    formatValue?: (value: number) => string;

    containerClassName?: string;
};

export const RangeInput = forwardRef<HTMLInputElement, RangeInputProps>(
    (
        {
            id,
            label,
            helperText,
            error,
            required,
            disabled,

            min = 0,
            max = 100,
            step = 1,
            value,
            showValue = true,
            formatValue,

            containerClassName,
            className,
            ...props
        },
        ref
    ) => {
        const numericValue = typeof value === "number" ? value : Number(value ?? min);

        const displayValue = formatValue ? formatValue(numericValue) : numericValue;

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
                    <div className={styles.wrapper}>
                        <input
                            ref={ref}
                            id={inputId}
                            type="range"
                            min={min}
                            max={max}
                            step={step}
                            value={value}
                            disabled={isDisabled}
                            aria-invalid={hasError}
                            aria-describedby={describedById}
                            className={`${styles.range} ${className ?? ""}`}
                            {...props}
                        />

                        {showValue && (
                            <Text
                                as="span"
                                variant="caption"
                                className={styles.value}
                                aria-hidden="true"
                            >
                                {displayValue}
                            </Text>
                        )}
                    </div>
                )}
            </InputBase>
        );
    }
);

RangeInput.displayName = "RangeInput";
