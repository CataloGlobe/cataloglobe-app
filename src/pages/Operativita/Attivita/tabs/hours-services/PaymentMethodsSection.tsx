import React, { useCallback } from "react";
import { Pill } from "@/components/ui/Pill/Pill";
import Text from "@/components/ui/Text/Text";
import styles from "./HoursServices.module.scss";

export const PAYMENT_METHODS = [
    "Carta di credito",
    "Contanti",
    "Ticket Restaurant",
    "Satispay",
    "Apple Pay",
    "Google Pay",
    "Bonifico"
];

interface PaymentMethodsSectionProps {
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}

export const PaymentMethodsSection: React.FC<PaymentMethodsSectionProps> = ({
    value,
    onChange,
    disabled
}) => {
    const handleToggle = useCallback(
        (method: string) => {
            const next = value.includes(method)
                ? value.filter(m => m !== method)
                : [...value, method];
            onChange(next);
        },
        [value, onChange]
    );

    return (
        <div>
            {value.length === 0 && (
                <Text
                    as="p"
                    variant="body-sm"
                    colorVariant="muted"
                    className={styles.pillHint}
                >
                    Seleziona i metodi di pagamento accettati
                </Text>
            )}
            <div className={styles.pillGrid}>
                {PAYMENT_METHODS.map(method => (
                    <Pill
                        key={method}
                        label={method}
                        active={value.includes(method)}
                        disabled={disabled}
                        onClick={() => handleToggle(method)}
                    />
                ))}
            </div>
        </div>
    );
};
