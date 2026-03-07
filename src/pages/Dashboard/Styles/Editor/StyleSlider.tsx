import React from "react";
import Text from "@/components/ui/Text/Text";
import styles from "./StyleSettingsControls.module.scss";

type StyleSliderProps = {
    label: string;
    value: number;
    min: number;
    max: number;
    unit?: string;
    onChange: (val: number) => void;
};

export const StyleSlider = ({
    label,
    value,
    min,
    max,
    unit = "px",
    onChange
}: StyleSliderProps) => {
    return (
        <div className={styles.controlField}>
            <div className={styles.sliderHeader}>
                <Text variant="body" weight={500} className={styles.fieldLabel}>
                    {label}
                </Text>
                <Text variant="caption" className={styles.sliderValue}>
                    {value}
                    {unit}
                </Text>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                value={value}
                onChange={e => onChange(parseInt(e.target.value, 10))}
                className={styles.sliderInput}
            />
        </div>
    );
};
