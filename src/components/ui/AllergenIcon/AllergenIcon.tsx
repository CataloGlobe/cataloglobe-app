import { ALLERGEN_ICON_MAP } from "@components/icons/allergens";
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

    return (
        <span
            className={`${styles.wrapper}${label ? ` ${styles.hasTooltip}` : ""}${className ? ` ${className}` : ""}`}
            aria-hidden="true"
        >
            <IconComponent
                size={size}
                className={styles.icon}
            />
            {label && <span className={styles.tooltip}>{label}</span>}
        </span>
    );
}
