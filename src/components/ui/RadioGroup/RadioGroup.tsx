import React from "react";
import { InputBase } from "../Input/InputBase";
import Text from "@components/ui/Text/Text";
import styles from "./RadioGroup.module.scss";

export interface RadioOption {
    value: string;
    label: string;
    description?: string;
}

export interface RadioGroupProps {
    id?: string;
    label?: string;
    helperText?: string;
    error?: string;

    value: string;
    onChange: (value: string) => void;

    options: RadioOption[];
    disabled?: boolean;
    required?: boolean;

    containerClassName?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
    id,
    label,
    helperText,
    error,
    value,
    onChange,
    options,
    disabled,
    required,
    containerClassName
}) => {
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
            {({ inputId, describedById, isDisabled }) => (
                <div className={styles.group} role="radiogroup" aria-describedby={describedById}>
                    {options.map(opt => {
                        const radioId = `${inputId}-${opt.value}`;

                        return (
                            <label
                                key={opt.value}
                                htmlFor={radioId}
                                className={`${styles.option} ${isDisabled ? styles.disabled : ""}`}
                            >
                                <input
                                    id={radioId}
                                    type="radio"
                                    name={inputId}
                                    value={opt.value}
                                    checked={value === opt.value}
                                    disabled={isDisabled}
                                    onChange={() => onChange(opt.value)}
                                    className={styles.input}
                                />

                                <span className={styles.circle} />

                                <span className={styles.text}>
                                    <Text as="span" variant="body" weight={500}>
                                        {opt.label}
                                    </Text>
                                    {opt.description && (
                                        <Text as="span" variant="caption">
                                            {opt.description}
                                        </Text>
                                    )}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </InputBase>
    );
};
