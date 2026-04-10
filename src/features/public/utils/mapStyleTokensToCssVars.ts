import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

/**
 * Parses a hex color (#rrggbb or #rgb) and returns relative luminance [0, 1].
 * Returns 0.5 on parse failure so the caller defaults to white text (safe).
 */
function hexLuminance(hex: string): number {
    const clean = hex.replace("#", "");
    const full = clean.length === 3
        ? clean.split("").map(c => c + c).join("")
        : clean;
    if (full.length !== 6) return 0.5;

    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;

    const linearize = (c: number) =>
        c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * Returns "#ffffff" or "#1a1a1a" depending on which gives better contrast
 * against the given background color.
 */
function contrastText(bgHex: string): string {
    return hexLuminance(bgHex) > 0.35 ? "#1a1a1a" : "#ffffff";
}

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

    const br = tokens.appearance.borderRadius;
    const pubRadius = br === "none" ? "0px" : br === "soft" ? "10px" : "20px";
    const btnRadius = br === "none" ? "0px" : br === "soft" ? "6px" : "10px";

    return {
        // ── Existing pub vars ────────────────────────────────────────────
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.headerBackground,
        "--pub-font-family": fontFamily,
        // --pub-card-bg kept for backward compat with existing SCSS modules
        "--pub-card-bg": tokens.colors.surface,

        // ── Shape ────────────────────────────────────────────────────────
        "--pub-radius": pubRadius,

        // ── New semantic vars ────────────────────────────────────────────
        "--pub-surface": tokens.colors.surface,
        "--pub-text": tokens.colors.textPrimary,
        "--pub-text-secondary": tokens.colors.textSecondary,
        // Derived: muted text at 60% opacity, primary tint at 10%
        "--pub-text-muted": `color-mix(in srgb, ${tokens.colors.textSecondary} 60%, transparent)`,
        "--pub-primary-soft": `color-mix(in srgb, ${tokens.colors.primary} 10%, transparent)`,
        "--pub-border": tokens.colors.border,

        // ── FeaturedBlock / CTA vars ─────────────────────────────────────
        // --pub-accent: colore accento testi (es. titolo CTA) → primario brand
        "--pub-accent": tokens.colors.primary,
        // --pub-cta-bg: sfondo pulsante CTA → primario brand
        "--pub-cta-bg": tokens.colors.primary,
        // --pub-cta-text: testo pulsante CTA → bianco/nero calcolato per contrasto
        "--pub-cta-text": contrastText(tokens.colors.primary),
        // --pub-btn-radius: arrotondamento pulsanti → coerente con --pub-radius
        "--pub-btn-radius": btnRadius,
        // --pub-page-background: alias di --pub-bg per PublicBrandHeader
        "--pub-page-background": tokens.colors.pageBackground,
    };
}
