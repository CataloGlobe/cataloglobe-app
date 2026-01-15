import React from "react";
import { InputBase } from "../Input/InputBase";
import Text from "@components/ui/Text/Text";
import styles from "./Switch.module.scss";

export interface SwitchProps {
    id?: string;
    label?: string;
    description?: string;
    helperText?: string;
    error?: string;

    checked: boolean;
    onChange: (checked: boolean) => void;

    disabled?: boolean;
    required?: boolean;

    containerClassName?: string;
}

export const Switch: React.FC<SwitchProps> = ({
    id,
    label,
    description,
    helperText,
    error,
    checked,
    onChange,
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
                <label
                    htmlFor={inputId}
                    className={`${styles.wrapper} ${isDisabled ? styles.disabled : ""}`}
                >
                    <input
                        id={inputId}
                        type="checkbox"
                        role="switch"
                        checked={checked}
                        disabled={isDisabled}
                        aria-describedby={describedById}
                        onChange={e => onChange(e.target.checked)}
                        className={styles.input}
                    />

                    <span className={styles.track} aria-hidden="true">
                        <span className={styles.thumb} />
                    </span>

                    {description && (
                        <Text as="span" variant="caption" className={styles.description}>
                            {description}
                        </Text>
                    )}
                </label>
            )}
        </InputBase>
    );
};
