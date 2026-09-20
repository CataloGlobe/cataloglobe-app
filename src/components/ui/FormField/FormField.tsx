import React, { useId } from "react";
import Text from "@components/ui/Text/Text";
import styles from "./FormField.module.scss";

/**
 * FormField — scheda «FormField» del design system (§5).
 *
 * Etichetta (14/500) · controllo · una riga sotto che è aiuto **o** errore,
 * mai entrambi: l'errore sostituisce l'aiuto. `required` mette l'asterisco
 * nella label. L'`id` è stabile (o quello passato) e `aria-describedby`
 * punta alla riga effettivamente mostrata.
 *
 * Estratto da `InputBase` (lotto 2b): `InputBase` resta come wrapper
 * deprecato con la stessa API, i dieci input, Select, Textarea e Switch
 * passano da qui.
 */

export type FormFieldRenderArgs = {
    inputId: string;
    describedById?: string;
    hasError: boolean;
    isDisabled: boolean;
};

export type FormFieldProps = {
    id?: string;

    label?: string;
    tooltip?: React.ReactNode;
    helperText?: string;
    error?: string;

    required?: boolean;
    disabled?: boolean;

    className?: string;

    /**
     * Render prop: qui dentro renderizzi TU il controllo e applichi
     * id / aria-describedby / aria-invalid / disabled.
     */
    children: (args: FormFieldRenderArgs) => React.ReactNode;
};

export function FormField({
    id,
    label,
    tooltip,
    helperText,
    error,
    required = false,
    disabled = false,
    className,
    children
}: FormFieldProps) {
    const reactId = useId();
    const inputId = id ?? `input-${reactId}`;

    const hasError = Boolean(error);
    const isDisabled = Boolean(disabled);

    // Una sola riga sotto il controllo: l'errore vince sull'aiuto.
    const showError = hasError;
    const showHelper = !hasError && Boolean(helperText);
    const describedById = showError ? `${inputId}-error` : showHelper ? `${inputId}-help` : undefined;

    return (
        <div className={`${styles.field} ${className ?? ""}`} data-disabled={isDisabled || undefined}>
            {label && (
                <div className={styles.labelRow}>
                    <Text as="label" variant="body-sm" weight={500} htmlFor={inputId} className={styles.label}>
                        {label}
                        {required && (
                            <Text as="span" variant="body-sm" colorVariant="muted" className={styles.required} aria-hidden="true">
                                {" *"}
                            </Text>
                        )}
                    </Text>
                    {tooltip}
                </div>
            )}

            <div className={styles.control}>{children({ inputId, describedById, hasError, isDisabled })}</div>

            {showHelper && (
                <Text as="span" id={describedById} variant="caption" colorVariant="muted" className={styles.helper}>
                    {helperText}
                </Text>
            )}

            {showError && (
                <Text as="span" id={describedById} variant="caption" colorVariant="error" className={styles.error} role="alert">
                    {error}
                </Text>
            )}
        </div>
    );
}

export default FormField;
