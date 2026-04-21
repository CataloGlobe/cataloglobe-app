import React, { useRef, useState, useEffect, useCallback } from "react";
import Text from "@/components/ui/Text/Text";
import { IconPencil } from "@tabler/icons-react";
import sharedStyles from "./StyleSettingsControls.module.scss";
import styles from "./StyleColorPicker.module.scss";

const PRESETS = [
    "#E24B4A", "#D85A30", "#BA7517", "#639922", "#1D9E75", "#378ADD", "#534AB7", "#D4537E",
    "#791F1F", "#712B13", "#633806", "#27500A", "#085041", "#0C447C", "#2C2C2A", "#888780"
];

type StyleColorPickerProps = {
    label: string;
    labelSuffix?: React.ReactNode;
    value: string;
    onChange: (val: string) => void;
};

export const StyleColorPicker = ({ label, labelSuffix, value, onChange }: StyleColorPickerProps) => {
    const colorInputRef = useRef<HTMLInputElement>(null);
    const popoverRef = useRef<HTMLDivElement>(null);
    const shellRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [draftHex, setDraftHex] = useState(value);
    const normalizedColor = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";

    // Sync draft when value changes externally
    useEffect(() => { setDraftHex(value); }, [value]);

    // Click outside + Escape
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setIsOpen(false);
        };
        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                popoverRef.current && !popoverRef.current.contains(target) &&
                shellRef.current && !shellRef.current.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("keydown", handleKey);
        document.addEventListener("mousedown", handleClick);
        return () => {
            document.removeEventListener("keydown", handleKey);
            document.removeEventListener("mousedown", handleClick);
        };
    }, [isOpen]);

    const applyHex = useCallback(() => {
        const clean = draftHex.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(clean)) {
            onChange(clean);
        }
    }, [draftHex, onChange]);

    const handlePreset = useCallback((hex: string) => {
        onChange(hex);
        setIsOpen(false);
    }, [onChange]);

    const handleHexKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.preventDefault();
            applyHex();
            setIsOpen(false);
        }
    }, [applyHex]);

    return (
        <div className={sharedStyles.controlField}>
            <Text variant="body" weight={500} className={sharedStyles.fieldLabel}>
                {label}{labelSuffix}
            </Text>
            <div className={styles.pickerWrapper}>
                <div
                    ref={shellRef}
                    className={sharedStyles.colorInputShell}
                    onClick={() => setIsOpen(true)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter" || e.key === " ") setIsOpen(true); }}
                >
                    <div className={sharedStyles.colorSwatch} style={{ backgroundColor: normalizedColor }} />
                    <span className={sharedStyles.colorHexInput} style={{ cursor: "pointer" }}>
                        {value.toUpperCase()}
                    </span>
                    <span className={sharedStyles.colorEditAction}>
                        <IconPencil size={16} stroke={1.9} />
                    </span>
                </div>

                {isOpen && (
                    <div ref={popoverRef} className={styles.popover}>
                        {/* Preset grid */}
                        <div className={styles.presetGrid}>
                            {PRESETS.map(hex => {
                                const isActive = normalizedColor.toUpperCase() === hex.toUpperCase();
                                return (
                                    <button
                                        key={hex}
                                        type="button"
                                        className={`${styles.presetDot} ${isActive ? styles.presetDotActive : ""}`}
                                        style={{ backgroundColor: hex }}
                                        onClick={() => handlePreset(hex)}
                                        aria-label={hex}
                                    />
                                );
                            })}
                        </div>

                        {/* Hex input + native picker */}
                        <div className={styles.hexRow}>
                            <input
                                type="text"
                                className={styles.hexInput}
                                value={draftHex}
                                onChange={e => setDraftHex(e.target.value)}
                                onBlur={applyHex}
                                onKeyDown={handleHexKeyDown}
                                maxLength={7}
                                placeholder="#000000"
                                spellCheck={false}
                                autoComplete="off"
                            />
                            <div className={styles.nativePickerWrapper}>
                                <input
                                    ref={colorInputRef}
                                    type="color"
                                    value={normalizedColor}
                                    onChange={e => onChange(e.target.value)}
                                    className={styles.nativePickerInput}
                                    tabIndex={-1}
                                />
                                <button
                                    type="button"
                                    className={styles.nativePickerBtn}
                                    onClick={() => colorInputRef.current?.click()}
                                    aria-label="Apri selettore colore nativo"
                                >
                                    <IconPencil size={14} stroke={2} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
