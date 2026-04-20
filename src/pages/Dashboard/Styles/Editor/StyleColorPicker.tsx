import React, { useRef } from "react";
import Text from "@/components/ui/Text/Text";
import { IconPencil } from "@tabler/icons-react";
import styles from "./StyleSettingsControls.module.scss";

type StyleColorPickerProps = {
    label: string;
    labelSuffix?: React.ReactNode;
    value: string;
    onChange: (val: string) => void;
};

export const StyleColorPicker = ({ label, labelSuffix, value, onChange }: StyleColorPickerProps) => {
    const colorInputRef = useRef<HTMLInputElement>(null);
    const normalizedColor = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";

    return (
        <div className={styles.controlField}>
            <Text variant="body" weight={500} className={styles.fieldLabel}>
                {label}{labelSuffix}
            </Text>
            <div className={styles.colorInputShell}>
                <div className={styles.colorSwatch} style={{ backgroundColor: normalizedColor }}>
                    <input
                        ref={colorInputRef}
                        type="color"
                        value={normalizedColor}
                        onChange={e => onChange(e.target.value)}
                        className={styles.hiddenColorInput}
                        title={`Scegli colore per ${label}`}
                    />
                </div>
                <input
                    type="text"
                    value={value}
                    onChange={e => {
                        const val = e.target.value;
                        onChange(val);
                    }}
                    className={styles.colorHexInput}
                    maxLength={7}
                    placeholder="#000000"
                />
                <button
                    type="button"
                    className={styles.colorEditAction}
                    onClick={() => colorInputRef.current?.click()}
                    aria-label={`Apri selettore colore per ${label}`}
                >
                    <IconPencil size={16} stroke={1.9} />
                </button>
            </div>
        </div>
    );
};
