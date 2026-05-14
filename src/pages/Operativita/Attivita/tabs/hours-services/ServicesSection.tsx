import React, { useCallback } from "react";
import { Pill } from "@/components/ui/Pill/Pill";
import Text from "@/components/ui/Text/Text";
import styles from "./HoursServices.module.scss";

export const SERVICES = [
    "WiFi gratuito",
    "Tavoli all'aperto",
    "Prenotazioni",
    "Delivery",
    "Asporto",
    "Parcheggio",
    "Accessibile disabili",
    "Animali ammessi",
    "Aria condizionata"
];

interface ServicesSectionProps {
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}

export const ServicesSection: React.FC<ServicesSectionProps> = ({
    value,
    onChange,
    disabled
}) => {
    const handleToggle = useCallback(
        (service: string) => {
            const next = value.includes(service)
                ? value.filter(s => s !== service)
                : [...value, service];
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
                    Seleziona i servizi offerti dalla sede
                </Text>
            )}
            <div className={styles.pillGrid}>
                {SERVICES.map(service => (
                    <Pill
                        key={service}
                        label={service}
                        active={value.includes(service)}
                        disabled={disabled}
                        onClick={() => handleToggle(service)}
                    />
                ))}
            </div>
        </div>
    );
};
