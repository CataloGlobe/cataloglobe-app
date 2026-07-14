import { useTheme } from "@/context/Theme/useTheme";
import iconFlat from "@/assets/brand/cataloglobe_icon_flat_primary.svg";
import iconGradient from "@/assets/brand/cataloglobe_icon_gradient_primary.svg";
import iconMonoDark from "@/assets/brand/cataloglobe_icon_mono_dark.svg";
import iconMonoWhite from "@/assets/brand/cataloglobe_icon_mono_white.svg";
import wordmarkFlat from "@/assets/brand/cataloglobe_wordmark_flat_primary.svg";
import wordmarkGradient from "@/assets/brand/cataloglobe_wordmark_gradient_primary.svg";
import wordmarkMonoDark from "@/assets/brand/cataloglobe_wordmark_mono_dark.svg";
import wordmarkMonoWhite from "@/assets/brand/cataloglobe_wordmark_mono_white.svg";
import lockupHorizontalFlat from "@/assets/brand/cataloglobe_lockup_horizontal_flat_primary.svg";
import lockupHorizontalGradient from "@/assets/brand/cataloglobe_lockup_horizontal_gradient_primary.svg";
import lockupHorizontalMonoDark from "@/assets/brand/cataloglobe_lockup_horizontal_mono_dark.svg";
import lockupHorizontalMonoWhite from "@/assets/brand/cataloglobe_lockup_horizontal_mono_white.svg";
import lockupVerticalFlat from "@/assets/brand/cataloglobe_lockup_vertical_flat_primary.svg";
import lockupVerticalGradient from "@/assets/brand/cataloglobe_lockup_vertical_gradient_primary.svg";
import lockupVerticalMonoDark from "@/assets/brand/cataloglobe_lockup_vertical_mono_dark.svg";
import lockupVerticalMonoWhite from "@/assets/brand/cataloglobe_lockup_vertical_mono_white.svg";
import styles from "./Logo.module.scss";

export type LogoVariant = "icon" | "wordmark" | "lockup-horizontal" | "lockup-vertical";
export type LogoColor = "flat" | "gradient" | "auto";

interface LogoProps {
    variant: LogoVariant;
    color?: LogoColor;
    size?: number;
    className?: string;
    alt?: string;
}

const ASSETS: Record<LogoVariant, { flat: string; gradient: string; monoDark: string; monoWhite: string }> = {
    icon: { flat: iconFlat, gradient: iconGradient, monoDark: iconMonoDark, monoWhite: iconMonoWhite },
    wordmark: { flat: wordmarkFlat, gradient: wordmarkGradient, monoDark: wordmarkMonoDark, monoWhite: wordmarkMonoWhite },
    "lockup-horizontal": {
        flat: lockupHorizontalFlat,
        gradient: lockupHorizontalGradient,
        monoDark: lockupHorizontalMonoDark,
        monoWhite: lockupHorizontalMonoWhite
    },
    "lockup-vertical": {
        flat: lockupVerticalFlat,
        gradient: lockupVerticalGradient,
        monoDark: lockupVerticalMonoDark,
        monoWhite: lockupVerticalMonoWhite
    }
};

export function Logo({ variant, color = "auto", size, className, alt = "CataloGlobe" }: LogoProps) {
    const { theme } = useTheme();
    const set = ASSETS[variant];

    const src =
        color === "flat"
            ? set.flat
            : color === "gradient"
              ? set.gradient
              : theme === "dark"
                ? set.monoWhite
                : set.monoDark;

    return (
        <img
            src={src}
            alt={alt}
            className={`${styles.logo} ${className ?? ""}`}
            style={size ? { height: size, width: "auto" } : undefined}
        />
    );
}
