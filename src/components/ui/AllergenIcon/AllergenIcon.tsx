import { ALLERGEN_ICON_MAP } from "@components/icons/allergens";
import { getChipScale } from "@components/icons/chipScale";
import styles from "./AllergenIcon.module.scss";

type Props = {
    code: string;
    size?: number;
    className?: string;
    label?: string;
    variant?: "default" | "bare";
    /**
     * Opt-in round tinted chip background (same look as CharacteristicIcon's
     * chip). Defaults to `false` (plain, bare icon). Driven by the Style Editor
     * `iconStyle` token. Never applied to `variant="bare"`.
     */
    chip?: boolean;
};

export default function AllergenIcon({ code, size = 20, className, label, variant = "default", chip = false }: Props) {
    const IconComponent = ALLERGEN_ICON_MAP[code];
    const applyChip = chip && variant !== "bare";

    if (!IconComponent) {
        return (
            <span
                className={`${variant === "bare" ? styles.fallbackBare : styles.fallback}${applyChip ? ` ${styles.chip}` : ""}${label ? ` ${styles.hasTooltip}` : ""}${className ? ` ${className}` : ""}`}
                style={variant === "bare" ? undefined : { width: size, height: size }}
                aria-hidden="true"
            >
                {code.charAt(0).toUpperCase()}
                {label && <span className={styles.tooltip}>{label}</span>}
            </span>
        );
    }

    if (variant === "bare") {
        return (
            <IconComponent
                size={size}
                className={`${styles.iconBare}${className ? ` ${className}` : ""}`}
            />
        );
    }

    // Chip-only optical balance: scale up sparse-ink icons inside the circle.
    // No-op (scale 1) in plain mode and for already-balanced icons.
    const chipScale = applyChip ? getChipScale(code) : 1;
    const iconEl = <IconComponent size={size} className={styles.icon} />;

    return (
        <span
            className={`${styles.wrapper}${applyChip ? ` ${styles.chip}` : ""}${label ? ` ${styles.hasTooltip}` : ""}${className ? ` ${className}` : ""}`}
            aria-hidden="true"
        >
            {chipScale !== 1 ? (
                <span className={styles.scaleWrap} style={{ transform: `scale(${chipScale})` }}>
                    {iconEl}
                </span>
            ) : (
                iconEl
            )}
            {label && <span className={styles.tooltip}>{label}</span>}
        </span>
    );
}
