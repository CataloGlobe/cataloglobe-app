import React, { useCallback } from "react";
import { Chip } from "@/components/ui/Chip/Chip";
import { SERVICES } from "./activityChoices";
import styles from "./ChoiceChips.module.scss";

interface ServicesSectionProps {
    value: string[];
    onChange: (next: string[]) => void;
    disabled?: boolean;
}

/** I servizi offerti, come Chip selezionabili (registro Sedi #53). */
export const ServicesSection: React.FC<ServicesSectionProps> = ({ value, onChange, disabled }) => {
    const handleToggle = useCallback(
        (service: string) => {
            onChange(value.includes(service) ? value.filter(s => s !== service) : [...value, service]);
        },
        [value, onChange]
    );

    return (
        <div className={styles.chips} role="group" aria-label="Servizi offerti">
            {SERVICES.map(service => (
                <Chip
                    key={service}
                    label={service}
                    selected={value.includes(service)}
                    disabled={disabled}
                    onClick={() => handleToggle(service)}
                />
            ))}
        </div>
    );
};
