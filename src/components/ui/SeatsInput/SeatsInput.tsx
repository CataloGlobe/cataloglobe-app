import { Minus, Plus } from "lucide-react";
import Text from "@/components/ui/Text/Text";
import styles from "./SeatsInput.module.scss";

interface SeatsInputProps {
    label?: string;
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    disabled?: boolean;
}

export function SeatsInput({
    label,
    value,
    onChange,
    min = 1,
    max = 25,
    disabled = false
}: SeatsInputProps) {
    return (
        <div className={styles.wrapper}>
            {label && (
                <Text variant="body-sm" weight={500} className={styles.label}>
                    {label}
                </Text>
            )}
            <div className={styles.stepper}>
                <button
                    type="button"
                    className={styles.btn}
                    onClick={() => onChange(Math.max(min, value - 1))}
                    disabled={disabled || value <= min}
                    aria-label="Diminuisci sedi"
                >
                    <Minus size={16} />
                </button>
                <span className={styles.value} aria-live="polite">
                    {value}
                </span>
                <button
                    type="button"
                    className={styles.btn}
                    onClick={() => onChange(Math.min(max, value + 1))}
                    disabled={disabled || value >= max}
                    aria-label="Aumenta sedi"
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}
