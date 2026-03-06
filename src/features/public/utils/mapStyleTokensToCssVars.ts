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

    return {
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.headerBackground,
        "--pub-header-radius": `${tokens.header.imageBorderRadiusPx}px`,
        "--pub-font-family": fontFamily,
        "--pub-card-bg": "#ffffff",
        "--pub-card-radius": tokens.card.radius === "sharp" ? "0px" : "14px",
        "--pub-nav-style": tokens.navigation.style
    };
}
