import React from "react";
import Text from "@components/ui/Text/Text";
import styles from "./Select.module.scss";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label: string;
    error?: string;
    options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
    label,
    error,
    id,
    options,
    className,
    ...props
}) => {
    const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, "-")}`;

    return (
        <div className={`${styles.wrapper} ${className || ""}`}>
            {/* LABEL */}
            <Text as="label" variant="body" weight={600} className={styles.label}>
                {label}
            </Text>

            {/* SELECT */}
            <div className={styles.selectWrapper}>
                <select id={selectId} className={styles.select} aria-invalid={!!error} {...props}>
                    {options.map(opt => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>

                {/* caret ↓ */}
                <span className={styles.caret} aria-hidden="true">
                    ▾
                </span>
            </div>

            {/* ERROR */}
            {error && (
                <Text as="span" variant="caption" colorVariant="error" className={styles.error}>
                    {error}
                </Text>
            )}
        </div>
    );
};
