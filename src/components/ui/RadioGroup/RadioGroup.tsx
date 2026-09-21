import React from "react";
import { InputBase } from "../Input/InputBase";
import Text from "@components/ui/Text/Text";
import { Tooltip } from "@components/ui/Tooltip/Tooltip";
import styles from "./RadioGroup.module.scss";

/**
 * RadioGroup — una scelta fra poche, tutte visibili (design system §5,
 * scheda RadioGroup). Ruolo di un invito, piano Base/Pro, tipo di regola.
 *
 * Opzioni con radio 16 · etichetta 14px 500 · descrizione caption muta.
 * `list` (radio + etichetta, compatta) · `card` (etichetta + descrizione in
 * un riquadro cliccabile con bordo: selezionato brand-primary + fondo
 * brand-primary-soft; padding 12 16, gap 8, raggio radius-control,
 * bersaglio 44). Stati: hover · selected · focus (shadow-focus) ·
 * disabilitata con tooltip che dice perché (`disabledReason`).
 *
 * Non per sì/no (→ Switch), non oltre cinque (→ Select), non per una scelta
 * multipla (→ Chip o checkbox).
 */

export interface RadioOption {
    value: string;
    label: string;
    description?: string;
    /** Disabilita questa singola opzione (opt-in). Il group-level `disabled` ha priorità. */
    disabled?: boolean;
    /** Perché è disabilitata: va nel Tooltip sull'opzione («Un manager non può invitare admin»). */
    disabledReason?: string;
}

export interface RadioGroupProps {
    id?: string;
    label?: string;
    tooltip?: React.ReactNode;
    helperText?: string;
    error?: string;

    value: string;
    onChange: (value: string) => void;

    options: RadioOption[];
    /** `list` (default) o `card`: riquadri con bordo per scelte che vanno spiegate. */
    variant?: "list" | "card";
    disabled?: boolean;
    required?: boolean;

    containerClassName?: string;
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
    id,
    label,
    tooltip,
    helperText,
    error,
    value,
    onChange,
    options,
    variant = "list",
    disabled,
    required,
    containerClassName
}) => {
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
                <div className={`${styles.group} ${variant === "card" ? styles.cards : ""}`.trim()} role="radiogroup" aria-invalid={hasError || undefined} aria-describedby={describedById}>
                    {options.map(opt => {
                        const radioId = `${inputId}-${opt.value}`;
                        const optDisabled = isDisabled || opt.disabled === true;
                        const selected = value === opt.value;

                        const option = (
                            <label
                                key={opt.value}
                                htmlFor={radioId}
                                className={[styles.option, variant === "card" ? styles.card : "", selected ? styles.selected : "", optDisabled ? styles.disabled : ""].join(" ").trim()}
                                data-state={selected ? "checked" : "unchecked"}
                            >
                                <input
                                    id={radioId}
                                    type="radio"
                                    name={inputId}
                                    value={opt.value}
                                    checked={value === opt.value}
                                    disabled={optDisabled}
                                    onChange={() => onChange(opt.value)}
                                    className={styles.input}
                                />

                                <span className={styles.circle} />

                                <span className={styles.text}>
                                    <Text as="span" variant="body-sm" weight={500}>
                                        {opt.label}
                                    </Text>
                                    {opt.description && (
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            {opt.description}
                                        </Text>
                                    )}
                                </span>
                            </label>
                        );

                        if (optDisabled && opt.disabledReason) {
                            return (
                                <Tooltip key={opt.value} content={opt.disabledReason}>
                                    {option}
                                </Tooltip>
                            );
                        }
                        return option;
                    })}
                </div>
            )}
        </InputBase>
    );
};
