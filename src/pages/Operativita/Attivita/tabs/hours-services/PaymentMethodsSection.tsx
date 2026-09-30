import React, { useCallback } from "react";
import { Chip } from "@/components/ui/Chip/Chip";
import { PAYMENT_METHODS } from "./activityChoices";
import styles from "./ChoiceChips.module.scss";

interface PaymentMethodsSectionProps {
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}

/** I metodi di pagamento accettati, come Chip selezionabili (registro Sedi #53). */
export const PaymentMethodsSection: React.FC<PaymentMethodsSectionProps> = ({ value, onChange, disabled }) => {
    const handleToggle = useCallback(
        (method: string) => {
            onChange(value.includes(method) ? value.filter(m => m !== method) : [...value, method]);
        },
        [value, onChange]
    );

    return (
        <div className={styles.chips} role="group" aria-label="Metodi di pagamento">
            {PAYMENT_METHODS.map(method => (
                <Chip
                    key={method}
                    label={method}
                    selected={value.includes(method)}
                    disabled={disabled}
                    onClick={() => handleToggle(method)}
                />
            ))}
        </div>
    );
};
