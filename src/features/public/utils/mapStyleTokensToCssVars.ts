import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

/**
 * Maps parsed style tokens to a flat record of --pub-* CSS custom properties.
 * Used by PublicThemeScope to apply scoped inline styles instead of :root injection.
 */
export function mapStyleTokensToCssVars(tokens: StyleTokenModel): Record<string, string> {
    const fontFamily =
        tokens.typography.fontFamily === "poppins"
            ? "'Poppins', sans-serif"
            : tokens.typography.fontFamily === "playfair"
              ? "'Playfair Display', serif"
              : "'Inter', sans-serif";

    const cardRadius = tokens.card.radius === "sharp" ? "0px" : "14px";

    return {
        // ── Existing pub vars ────────────────────────────────────────────
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.headerBackground,
        "--pub-header-radius": `${tokens.header.imageBorderRadiusPx}px`,
        "--pub-font-family": fontFamily,
        // --pub-card-bg kept for backward compat with existing SCSS modules
        "--pub-card-bg": tokens.colors.surface,
        "--pub-card-radius": cardRadius,
        "--pub-nav-style": tokens.navigation.style,

        // ── New semantic vars ────────────────────────────────────────────
        "--pub-surface": tokens.colors.surface,
        "--pub-text": tokens.colors.textPrimary,
        "--pub-text-secondary": tokens.colors.textSecondary,
        // Derived: muted text at 60% opacity, primary tint at 10%
        "--pub-text-muted": `color-mix(in srgb, ${tokens.colors.textSecondary} 60%, transparent)`,
        "--pub-primary-soft": `color-mix(in srgb, ${tokens.colors.primary} 10%, transparent)`,
        "--pub-border": tokens.colors.border,

    };
}
