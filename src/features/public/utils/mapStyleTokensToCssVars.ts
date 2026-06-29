import type { StyleTokenModel, BorderRadius, PatternIntensity } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

const PATTERN_INTENSITY_MULTIPLIER: Record<PatternIntensity, number> = {
    subtle: 0.5,
    medium: 1.0,
    strong: 1.75
};

function parseHex(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "");
    const full =
        clean.length === 3
            ? clean
                  .split("")
                  .map(c => c + c)
                  .join("")
            : clean;
    return {
        r: parseInt(full.slice(0, 2), 16) || 0,
        g: parseInt(full.slice(2, 4), 16) || 0,
        b: parseInt(full.slice(4, 6), 16) || 0
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
    const full =
        clean.length === 3
            ? clean
                  .split("")
                  .map(c => c + c)
                  .join("")
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
export function contrastText(bgHex: string): string {
    return isLight(bgHex) ? "#1a1a1a" : "#ffffff";
}

/**
 * Generates the CSS background-image value for a given pattern + color + intensity.
 * Returns [backgroundImage, backgroundSize] tuple.
 * Base opacities are perceptually normalized across patterns;
 * the intensity multiplier scales them and the result is clamped to 0.8.
 */
export function getPatternCss(
    pattern: string,
    colorHex: string,
    intensity: PatternIntensity = "medium"
): [string, string] {
    const { r, g, b } = parseHex(colorHex);
    const multiplier = PATTERN_INTENSITY_MULTIPLIER[intensity] ?? 1.0;
    const clampOpacity = (base: number) => Math.min(0.8, base * multiplier);
    const rgba = (base: number) => `rgba(${r},${g},${b},${clampOpacity(base)})`;

    switch (pattern) {
        case "dots":
            return [`radial-gradient(circle, ${rgba(0.18)} 1px, transparent 1px)`, "16px 16px"];
        case "diagonal":
            return [
                `repeating-linear-gradient(45deg, transparent, transparent 10px, ${rgba(0.10)} 10px, ${rgba(0.10)} 11px)`,
                "auto"
            ];
        case "waves":
            return [
                `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='20'><path d='M0 10 Q20 0 40 10 T80 10' fill='none' stroke='${rgba(0.12)}' stroke-width='1.5'/></svg>`)}")`,
                "80px 20px"
            ];
        case "crosshatch":
            return [
                `repeating-linear-gradient(45deg, ${rgba(0.10)} 0px, ${rgba(0.10)} 0.5px, transparent 0.5px, transparent 6px), repeating-linear-gradient(-45deg, ${rgba(0.10)} 0px, ${rgba(0.10)} 0.5px, transparent 0.5px, transparent 6px)`,
                "auto"
            ];
        case "noise": {
            const finalOpacity = clampOpacity(0.12);
            const rNorm = (r / 255).toFixed(4);
            const gNorm = (g / 255).toFixed(4);
            const bNorm = (b / 255).toFixed(4);
            const op = finalOpacity.toFixed(4);
            // Matrix riga A = 0.5 0.5 0.5 0 0 → alpha derivata da luminanza turbulence (random),
            // poi rect.opacity applica il moltiplicatore globale dell'opacità target.
            // baseFrequency=0.65 produce grain "film" più leggibile di 0.85.
            const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${rNorm} 0 0 0 0 ${gNorm} 0 0 0 0 ${bNorm} 0.5 0.5 0.5 0 0'/></filter><rect width='120' height='120' filter='url(#n)' opacity='${op}'/></svg>`;
            return [
                `url("data:image/svg+xml,${encodeURIComponent(svg)}")`,
                "120px 120px"
            ];
        }
        default:
            return ["none", "auto"];
    }
}

/**
 * Converte il token BorderRadius nel valore numerico in px usato dall'animazione lerp dell'header.
 * Stessa tabella di conversione usata per --pub-radius nella CSS var.
 */
export function borderRadiusToPx(br: BorderRadius): number {
    return br === "none" ? 0 : br === "soft" ? 10 : 20;
}

/**
 * Maps parsed style tokens to a flat record of --pub-* CSS custom properties.
 * Used by PublicThemeScope to apply scoped inline styles instead of :root injection.
 */
export function mapStyleTokensToCssVars(tokens: StyleTokenModel): Record<string, string> {
    const FONT_MAP: Record<string, string> = {
        inter: "'Inter', sans-serif",
        poppins: "'Poppins', sans-serif",
        montserrat: "'Montserrat', sans-serif",
        "josefin-sans": "'Josefin Sans', sans-serif",
        raleway: "'Raleway', sans-serif",
        playfair: "'Playfair Display', serif",
        lora: "'Lora', serif",
        "cormorant-garamond": "'Cormorant Garamond', serif",
        caveat: "'Caveat', cursive"
    };
    const fontFamily = FONT_MAP[tokens.typography.fontFamily] ?? "'Inter', sans-serif";

    const br = tokens.appearance.borderRadius;
    const pubRadius = br === "none" ? "0px" : br === "soft" ? "10px" : "20px";
    const btnRadius = br === "none" ? "0px" : br === "soft" ? "6px" : "10px";

    const bgLight = isLight(tokens.colors.pageBackground);
    const surfaceLight = isLight(tokens.colors.surface);

    // Accent (ruolo "azione"): se non impostato segue il primario → stili esistenti invariati
    const accent = tokens.colors.accent || tokens.colors.primary;

    // Ink (neutro utility/chrome): quasi-nero/quasi-bianco che assorbe il 12% del colore pagina.
    // Su sfondo chiaro resta scuro, su sfondo scuro diventa una pill chiara → sempre leggibile.
    // Derivato dallo sfondo pagina così le pill utility si staccano da --pub-surface.
    const ink = mixHex(contrastText(tokens.colors.pageBackground), tokens.colors.pageBackground, 0.12);
    const inkText = contrastText(ink);

    // Derived text colors — always computed from background contrast, never from saved tokens
    const bgText = contrastText(tokens.colors.pageBackground);
    const surfaceText = contrastText(tokens.colors.surface);
    const surfaceTextSecondary = surfaceLight ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.65)";
    const surfaceTextMuted = surfaceLight ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.45)";
    const bgTextSecondary = bgLight ? "rgba(0, 0, 0, 0.55)" : "rgba(255, 255, 255, 0.65)";
    const bgTextMuted = bgLight ? "rgba(0, 0, 0, 0.38)" : "rgba(255, 255, 255, 0.45)";

    // Border colors — 10% contrast text blended into background
    const borderOnBg = mixHex(tokens.colors.pageBackground, bgText, 0.1);
    const borderOnSurface = mixHex(tokens.colors.surface, surfaceText, 0.15);

    const [patternImage, patternSize] = getPatternCss(
        tokens.appearance.backgroundPattern,
        bgText,
        tokens.appearance.patternIntensity
    );

    return {
        // ── Existing pub vars ────────────────────────────────────────────
        "--pub-bg": tokens.colors.pageBackground,
        "--pub-primary": tokens.colors.primary,
        "--pub-header-bg": tokens.colors.primary,
        "--pub-font-family": fontFamily,

        // ── Shape ────────────────────────────────────────────────────────
        "--pub-radius": pubRadius,

        // ── Background pattern ───────────────────────────────────────────
        "--pub-bg-pattern": patternImage,
        "--pub-bg-pattern-size": patternSize,

        // ── New semantic vars ────────────────────────────────────────────
        "--pub-surface": tokens.colors.surface,
        // Neutro utility/chrome (pill allergeni/caratteristiche + cerchi social) — staccato da surface
        "--pub-ink": ink,
        "--pub-ink-text": inkText,
        // Base text vars default to surface context (most text sits on cards)
        "--pub-text": surfaceText,
        "--pub-text-secondary": surfaceTextSecondary,
        "--pub-text-muted": surfaceTextMuted,
        "--pub-primary-soft": `color-mix(in srgb, ${tokens.colors.primary} 20%, ${tokens.colors.surface})`,
        "--pub-border": borderOnBg,
        "--pub-surface-border": borderOnSurface,

        // ── FeaturedBlock / CTA vars ─────────────────────────────────────
        // --pub-accent: colore azione (pulsanti prodotto + accento CTA) → accent (fallback primario)
        "--pub-accent": accent,
        // --pub-cta-bg: sfondo pulsante CTA → accent (fallback primario)
        "--pub-cta-bg": accent,
        // --pub-cta-text: testo pulsante CTA → bianco/nero calcolato per contrasto sull'accent
        "--pub-cta-text": contrastText(accent),
        // --pub-btn-radius: arrotondamento pulsanti → coerente con --pub-radius
        "--pub-btn-radius": btnRadius,
        // --pub-page-background: alias di --pub-bg per PublicBrandHeader
        "--pub-page-background": tokens.colors.pageBackground,

        // ── Contrast-safe text on configurable backgrounds ───────────────────
        // Text directly on --pub-bg (page background)
        "--pub-bg-text": bgText,
        "--pub-bg-text-secondary": bgTextSecondary,
        "--pub-bg-text-muted": bgTextMuted,

        // Text directly on --pub-surface (content areas, cards, nav bar)
        "--pub-surface-text": surfaceText,
        "--pub-surface-text-secondary": surfaceTextSecondary,
        "--pub-surface-text-muted": surfaceTextMuted,

        // ── Card shadows ─────────────────────────────────────────────────
        // Centralized to keep FeaturedCard and product cards in sync
        "--pub-card-shadow":
            "0 2px 8px color-mix(in srgb, var(--pub-bg-text) 10%, transparent), 0 0 1px color-mix(in srgb, var(--pub-surface-text) 8%, transparent)",
        "--pub-card-shadow-hover":
            "0 4px 14px color-mix(in srgb, var(--pub-bg-text) 14%, transparent), 0 0 2px color-mix(in srgb, var(--pub-surface-text) 10%, transparent)"
    };
}
