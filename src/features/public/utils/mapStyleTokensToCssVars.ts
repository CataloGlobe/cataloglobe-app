import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

function parseHex(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "");
    const full = clean.length === 3
        ? clean.split("").map(c => c + c).join("")
        : clean;
    return {
        r: parseInt(full.slice(0, 2), 16) || 0,
        g: parseInt(full.slice(2, 4), 16) || 0,
        b: parseInt(full.slice(4, 6), 16) || 0,
    };
}

/**
 * Blends fgHex into bgHex at the given alpha [0, 1] and returns a hex string.
 * e.g. mixHex("#ffffff", "#1a1a1a", 0.1) → very light grey
 */
function mixHex(bgHex: string, fgHex: string, alpha: number): string {
    const bg = parseHex(bgHex);
    const fg = parseHex(fgHex);
    const r = Math.round(bg.r * (1 - alpha) + fg.r * alpha);
    const g = Math.round(bg.g * (1 - alpha) + fg.g * alpha);
    const b = Math.round(bg.b * (1 - alpha) + fg.b * alpha);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

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
 * Returns true if the color is perceptually light (luminance > 0.35).
 */
function isLight(hex: string): boolean {
    return hexLuminance(hex) > 0.35;
}

/**
 * Returns "#ffffff" or "#1a1a1a" depending on which gives better contrast
 * against the given background color.
 */
function contrastText(bgHex: string): string {
    return isLight(bgHex) ? "#1a1a1a" : "#ffffff";
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

    const bgLight = isLight(tokens.colors.pageBackground);
    const surfaceLight = isLight(tokens.colors.surface);

    // Derived text colors — always computed from background contrast, never from saved tokens
    const bgText = contrastText(tokens.colors.pageBackground);
    const surfaceText = contrastText(tokens.colors.surface);
    const surfaceTextSecondary = surfaceLight ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.65)";
    const surfaceTextMuted     = surfaceLight ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.45)";
    const bgTextSecondary      = bgLight      ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.65)";
    const bgTextMuted          = bgLight      ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.45)";

    // Border colors — 10% contrast text blended into background
    const borderOnBg      = mixHex(tokens.colors.pageBackground, bgText, 0.10);
    const borderOnSurface = mixHex(tokens.colors.surface, surfaceText, 0.15);

    return {
        // ── Existing pub vars ────────────────────────────────────────────
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.primary,
        "--pub-font-family": fontFamily,
        // --pub-card-bg kept for backward compat with existing SCSS modules
        "--pub-card-bg": tokens.colors.surface,

        // ── Shape ────────────────────────────────────────────────────────
        "--pub-radius": pubRadius,

        // ── New semantic vars ────────────────────────────────────────────
        "--pub-surface": tokens.colors.surface,
        // Base text vars default to surface context (most text sits on cards)
        "--pub-text": surfaceText,
        "--pub-text-secondary": surfaceTextSecondary,
        "--pub-text-muted": surfaceTextMuted,
        "--pub-primary-soft": `color-mix(in srgb, ${tokens.colors.primary} 10%, transparent)`,
        "--pub-border": borderOnBg,
        "--pub-surface-border": borderOnSurface,

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

        // ── Contrast-safe text on configurable backgrounds ───────────────────
        // Text directly on --pub-bg (page background)
        "--pub-bg-text": bgText,
        "--pub-bg-text-secondary": bgTextSecondary,
        "--pub-bg-text-muted": bgTextMuted,

        // Text directly on --pub-surface / --pub-card-bg (content areas, cards, nav bar)
        "--pub-surface-text": surfaceText,
        "--pub-surface-text-secondary": surfaceTextSecondary,
        "--pub-surface-text-muted": surfaceTextMuted,
    };
}
