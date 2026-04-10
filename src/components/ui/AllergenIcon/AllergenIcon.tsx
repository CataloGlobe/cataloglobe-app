import { ALLERGEN_ICON_MAP } from "@components/icons/allergens";
import styles from "./AllergenIcon.module.scss";

type Props = {
    code: string;
    size?: number;
    className?: string;
    label?: string;
    variant?: "default" | "bare";
};

export default function AllergenIcon({ code, size = 20, className, label, variant = "default" }: Props) {
    const IconComponent = ALLERGEN_ICON_MAP[code];

    if (!IconComponent) {
        return (
            <span
                className={`${variant === "bare" ? styles.fallbackBare : styles.fallback}${label ? ` ${styles.hasTooltip}` : ""}${className ? ` ${className}` : ""}`}
                style={variant === "bare" ? undefined : { width: size + 8, height: size + 8 }}
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
