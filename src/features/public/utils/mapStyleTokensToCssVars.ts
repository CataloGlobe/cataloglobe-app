import type { StyleTokenModel, BorderRadius, PatternIntensity } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { CONTOUR_TILE, contourPath } from "./patternContour";
import { INK_ON_DARK, INK_ON_LIGHT, borderColor, fixContrast, isDarkPage, lum, mix, onColor, rgbOf, tintDark } from "./styleColors";

// Stessi passi dell'editor stili (Leggera, Media, Forte).
const PATTERN_INTENSITY_MULTIPLIER: Record<PatternIntensity, number> = {
    subtle: 0.6,
    medium: 1.0,
    strong: 1.5
};

/** Raggi in px [card, pulsanti, riquadro in cima] per ogni scelta di angoli (editor stili). */
const RADII: Record<BorderRadius, readonly [number, number, number]> = {
    none: [4, 3, 6],
    soft: [12, 8, 14],
    rounded: [20, 10, 22]
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
 * Converts a hex color (#rrggbb or #rgb) into an rgba() string at the given alpha [0, 1].
 * Used to build the glass surface "tint floor" — a semi-transparent surface color that
 * keeps text legible behind the blur even over a flat background.
 */
export function hexToRgba(hex: string, alpha: number): string {
    const { r, g, b } = parseHex(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
    intensity: PatternIntensity = "medium",
    primaryHex: string = colorHex
): [string, string] {
    const { r, g, b } = parseHex(colorHex);
    const multiplier = PATTERN_INTENSITY_MULTIPLIER[intensity] ?? 1.0;
    const clampOpacity = (base: number) => Math.min(0.8, base * multiplier);
    const rgba = (base: number) => `rgba(${r},${g},${b},${clampOpacity(base)})`;
    const svg = (s: string) => `url("data:image/svg+xml,${encodeURIComponent(s)}")`;
    const [nr, ng, nb] = [r, g, b].map(v => (v / 255).toFixed(3));

    switch (pattern) {
        case "glow": {
            // Una luce sola del principale in alto al centro; --pub-glow-y la abbassa sotto la copertina.
            const p = parseHex(primaryHex);
            const a = (base: number) => `rgba(${p.r},${p.g},${p.b},${(base * multiplier).toFixed(3)})`;
            return [`radial-gradient(150% 460px at 50% var(--pub-glow-y, 20px), ${a(0.22)}, ${a(0.08)} 45%, transparent 75%)`, "100% 100%"];
        }
        case "dots": {
            const g2 = 28;
            return [
                svg(`<svg xmlns='http://www.w3.org/2000/svg' width='${g2}' height='${g2}'><circle cx='${g2 / 4}' cy='${g2 / 4}' r='1.25' fill='${rgba(0.16)}'/><circle cx='${(3 * g2) / 4}' cy='${(3 * g2) / 4}' r='1.25' fill='${rgba(0.16)}'/></svg>`),
                `${g2}px ${g2}px`
            ];
        }
        case "linen":
            return [
                svg(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 240'><filter id='h' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='0.025 1.3' numOctaves='1' seed='4' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${nr} 0 0 0 0 ${ng} 0 0 0 0 ${nb} 0 0 0 5 -2.4'/></filter><filter id='v' x='0' y='0' width='1' height='1'><feTurbulence type='fractalNoise' baseFrequency='1.3 0.025' numOctaves='1' seed='9' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${nr} 0 0 0 0 ${ng} 0 0 0 0 ${nb} 0 0 0 5 -2.5'/></filter><rect width='240' height='240' filter='url(#h)' opacity='${(0.06 * multiplier).toFixed(3)}'/><rect width='240' height='240' filter='url(#v)' opacity='${(0.045 * multiplier).toFixed(3)}'/></svg>`),
                "240px 240px"
            ];
        case "contour":
            return [
                contourUrl(rgba(0.09)),
                `${CONTOUR_TILE}px ${CONTOUR_TILE}px`
            ];
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

// Il tracciato pesa ~47 KB: l'URL si ricalcola solo quando cambia il colore della linea
// (l'anteprima dell'editor chiama il mapper a ogni modifica).
let contourCache: { stroke: string; url: string } | null = null;
function contourUrl(stroke: string): string {
    if (contourCache?.stroke !== stroke) {
        const s = `<svg xmlns='http://www.w3.org/2000/svg' width='${CONTOUR_TILE}' height='${CONTOUR_TILE}'><path d='${contourPath()}' fill='none' stroke='${stroke}' stroke-width='1' stroke-linecap='round'/></svg>`;
        contourCache = { stroke, url: `url("data:image/svg+xml,${encodeURIComponent(s)}")` };
    }
    return contourCache.url;
}

/**
 * Converte il token BorderRadius nel valore numerico in px usato dall'animazione lerp dell'header.
 * Stessa tabella di conversione usata per --pub-radius nella CSS var.
 */
export function borderRadiusToPx(br: BorderRadius): number {
    return (RADII[br] ?? RADII.rounded)[0];
}

/**
 * Superficie (card/modali) derivata dallo sfondo pagina: bianca per sfondi chiari e
 * mid-tone, neutro sollevato (+12% bianco) solo per sfondi davvero scuri (luminanza < 0.15).
 * Fonte unica della superficie, usata dal mapper.
 */
export function deriveSurface(pageBackground: string): string {
    return isDarkPage(pageBackground) ? mix(pageBackground, "#FFFFFF", 0.12) : "#FFFFFF";
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
        spectral: "'Spectral', serif",
        lora: "'Lora', serif",
        "eb-garamond": "'EB Garamond', serif",
        "patrick-hand": "'Patrick Hand', cursive"
    };
    const fontFamily = FONT_MAP[tokens.typography.fontFamily] ?? "'Inter', sans-serif";

    const [cardRadius, btnRadius, islandRadius] = RADII[tokens.appearance.borderRadius] ?? RADII.rounded;

    // Regole dei colori dell'editor stili (spec §2): pagina scura sotto 0,18 di luminanza,
    // testo caldo quasi nero o quasi bianco, principale e pulsanti corretti per il contrasto.
    const bg = tokens.colors.pageBackground;
    const dark = isDarkPage(bg);
    const ink = dark ? INK_ON_DARK : INK_ON_LIGHT;
    // Un solo attenuato per secondary e muted: al 62% fa 4,5:1 anche sui riquadri bianchi
    // (D75, deciso da Lorenzo il 2026-10-13: mai sotto WCAG AA).
    const mut = dark ? "rgb(243 241 236 / 64%)" : "rgb(27 26 23 / 62%)";

    // superficie derivata dallo sfondo (no più colore utente) — vedi deriveSurface
    const surface = deriveSurface(bg);
    const primary = fixContrast(tokens.colors.primary, [bg, surface]);
    const accentRaw = tokens.colors.accent || tokens.colors.primary;
    const onAccent = onColor(accentRaw);
    const accent = fixContrast(accentRaw, [onAccent]);

    // Ink (neutro utility/chrome): quasi-nero/quasi-bianco che assorbe il 12% del colore pagina.
    // Su sfondo chiaro resta scuro, su sfondo scuro diventa una pill chiara → sempre leggibile.
    // Derivato dallo sfondo pagina così le pill utility si staccano da --pub-surface.
    const inkPill = mixHex(ink, bg, 0.12);
    const inkText = isDarkPage(inkPill) ? INK_ON_DARK : INK_ON_LIGHT;

    const borderOnBg = mixHex(bg, ink, 0.1);
    const outline = borderColor(tokens.appearance.outlinedBorderColor === "primary", bg, primary);

    const [patternImage, patternSize] = getPatternCss(
        tokens.appearance.backgroundPattern,
        ink,
        tokens.appearance.patternIntensity,
        primary
    );

    // Tripletta RGB dello sfondo pagina per gradienti alpha `rgba(var(--pub-bg-rgb), a)`.
    // Un gradiente verso `transparent` (o via color-mix con transparent) interpola verso
    // rgba(0,0,0,0) e produce banding grigio su WebKit; con la tripletta l'endpoint ad
    // alpha 0 conserva l'hue per costruzione. Stesso parseHex di --pub-bg (fallback 0 per canale).
    const bgRgb = parseHex(bg);

    // Ombre nel tono della pagina; su pagina quasi bianca il pieno ha bisogno di un'ombra più netta.
    const tint = rgbOf(mix(bg, "#000000", dark ? 0.6 : 0.55)).join(",");
    const nearWhite = !dark && lum(bg) > 0.95;
    const raisedShadow = dark
        ? "inset 0 1px 0 rgba(255,255,255,.07), 0 2px 4px rgba(0,0,0,.35), 0 12px 26px -8px rgba(0,0,0,.6)"
        : nearWhite
            ? `0 0 0 1px rgba(${tint},.07), 0 2px 5px rgba(${tint},.12), 0 12px 24px -8px rgba(${tint},.26)`
            : `0 1px 2px rgba(${tint},.07), 0 6px 14px -4px rgba(${tint},.13), 0 18px 30px -14px rgba(${tint},.16)`;
    const raisedShadowHover = dark
        ? "inset 0 1px 0 rgba(255,255,255,.07), 0 4px 8px rgba(0,0,0,.4), 0 16px 32px -8px rgba(0,0,0,.65)"
        : `0 1px 2px rgba(${tint},.08), 0 8px 18px -4px rgba(${tint},.17), 0 22px 36px -14px rgba(${tint},.2)`;

    // Riquadro in cima, barra in basso e scheda del piatto: chiari o scuri, mai nel colore del locale.
    // Uno stile salvato prima dell'editor nuovo resta scuro come la pagina di oggi.
    const chromeDark = (tokens.header.chrome ?? "dark") === "dark";
    const treatment = tokens.appearance.cardTreatment;
    const glass = treatment === "glass";
    const darkTone = tintDark(bg);
    const chromeBg = chromeDark
        ? glass ? `rgb(${rgbOf(darkTone).join(" ")} / 80%)` : darkTone
        : glass ? (dark ? "rgb(255 255 255 / 90%)" : "rgb(255 255 255 / 70%)") : "#FFFFFF";
    const chromeActive = fixContrast(tokens.colors.primary, [chromeDark ? darkTone : "#F7F7F7"]);
    const chromeBorder =
        treatment === "bordered"
            ? `.5px solid ${tokens.appearance.outlinedBorderColor === "primary" ? primary : chromeDark ? "rgb(255 255 255 / 28%)" : outline}`
            : glass
                ? chromeDark ? "1px solid rgb(255 255 255 / 10%)" : "1px solid rgb(255 255 255 / 70%)"
                : "0px solid transparent";
    const sheetBg = chromeDark ? tintDark(bg, 0.12) : "#F7F5F1";

    return {
        // ── Existing pub vars ────────────────────────────────────────────
        "--pub-bg": bg,
        "--pub-bg-rgb": `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`,
        "--pub-primary": primary,
        // --pub-primary-text: testo su elementi primary-filled (nav attiva, badge) →
        // contrasto sul primario, NON sull'accent (cta-text serve solo agli elementi accent-filled)
        "--pub-primary-text": onColor(primary),
        "--pub-header-bg": tokens.colors.primary,
        "--pub-font-family": fontFamily,

        // ── Shape ────────────────────────────────────────────────────────
        "--pub-radius": `${cardRadius}px`,
        "--pub-island-radius": `${islandRadius}px`,

        // ── Background pattern ───────────────────────────────────────────
        "--pub-bg-pattern": patternImage,
        "--pub-bg-pattern-size": patternSize,

        // ── New semantic vars ────────────────────────────────────────────
        "--pub-surface": surface,
        // Pavimento-tinta del materiale "vetro" per fogli e intestazioni (le card hanno --pub-card-glass).
        "--pub-surface-glass": hexToRgba(surface, dark ? 0.68 : 0.8),
        // Neutro utility/chrome (pill allergeni/caratteristiche + cerchi social) — staccato da surface
        "--pub-ink": inkPill,
        "--pub-ink-text": inkText,
        // Base text vars default to surface context (most text sits on cards)
        "--pub-text": ink,
        "--pub-text-secondary": mut,
        "--pub-text-muted": mut,
        "--pub-primary-soft": `color-mix(in srgb, ${primary} 30%, ${surface})`,
        "--pub-border": borderOnBg,
        "--pub-surface-border": outline,

        // ── FeaturedBlock / CTA vars ─────────────────────────────────────
        // --pub-accent: colore azione (pulsanti prodotto + accento CTA) → accent (fallback primario)
        "--pub-accent": accent,
        "--pub-cta-bg": accent,
        "--pub-cta-text": onAccent,
        "--pub-btn-radius": `${btnRadius}px`,

        // ── Contrast-safe text on configurable backgrounds ───────────────────
        "--pub-bg-text": ink,
        "--pub-bg-text-secondary": mut,
        "--pub-bg-text-muted": mut,
        "--pub-surface-text": ink,
        "--pub-surface-text-secondary": mut,
        "--pub-surface-text-muted": mut,

        // ── Materiale dei riquadri (piatti, In evidenza) ─────────────────
        "--pub-card-shadow": raisedShadow,
        "--pub-card-shadow-hover": raisedShadowHover,
        "--pub-card-outline-bg": dark ? "transparent" : mix(bg, surface, 0.45),
        "--pub-card-outline-shadow": dark
            ? "0 1px 2px rgba(0,0,0,.4), 0 10px 20px -10px rgba(0,0,0,.7)"
            : `0 1px 2px rgba(${tint},.08), 0 8px 16px -10px rgba(${tint},.22)`,
        "--pub-card-glass": dark ? "rgba(60,56,52,.45)" : "rgba(255,255,255,.52)",
        "--pub-card-glass-border": dark ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.75)",
        "--pub-card-glass-shadow": dark
            ? "inset 0 1px 0 rgba(255,255,255,.10), 0 12px 28px -12px rgba(0,0,0,.7)"
            : `inset 0 1px 0 rgba(255,255,255,.9), 0 10px 24px -12px rgba(${tint},.25)`,
        // Riquadro di testo di In evidenza senza foto.
        "--pub-card-text-only": `color-mix(in srgb, ${primary} 10%, ${surface})`,

        // ── Parti fisse: riquadro in cima, barra, scheda del piatto ─────
        "--pub-chrome-bg": chromeBg,
        "--pub-chrome-solid": chromeDark ? darkTone : "#FFFFFF",
        "--pub-chrome-text": chromeDark ? "#FFFFFF" : INK_ON_LIGHT,
        "--pub-chrome-on": chromeDark ? "#111111" : "#FFFFFF",
        "--pub-chrome-blur": glass ? "blur(18px) saturate(1.4)" : "none",
        "--pub-chrome-shadow": treatment === "bordered"
            ? "0 1px 2px rgb(0 0 0 / 8%), 0 8px 18px -10px rgb(0 0 0 / 25%)"
            : "0 10px 28px -12px rgb(0 0 0 / 45%)",
        "--pub-chrome-border": chromeBorder,
        "--pub-chrome-active": chromeActive,
        "--pub-chrome-active-text": onColor(chromeActive),
        "--pub-sheet-bg": sheetBg,
        "--pub-sheet-text": chromeDark ? INK_ON_DARK : INK_ON_LIGHT,
        "--pub-sheet-primary": fixContrast(tokens.colors.primary, [sheetBg])
    };
}
