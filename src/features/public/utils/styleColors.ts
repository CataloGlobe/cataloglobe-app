/**
 * Regole dei colori dell'editor stili (spec `editor-stili/spec-app.md` §2, stesse
 * funzioni del simulatore `sim-v5.mjs`): pagina chiara o scura, contrasto garantito,
 * scuro nel tono della pagina, colore del contorno, consiglio Chiari/Scuri.
 */

/** Sotto questa luminanza la pagina è scura. */
export const DARK_PAGE_LUM = 0.18;

/** Testo su pagina scura e su pagina chiara. */
export const INK_ON_DARK = "#F3F1EC";
export const INK_ON_LIGHT = "#1B1A17";

export function rgbOf(hex: string): [number, number, number] {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map(c => c + c).join("");
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}

function toHex(v: readonly number[]): string {
    return "#" + v.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
}

/** Luminanza relativa (WCAG), 0..1. */
export function lum(hex: string): number {
    const [r, g, b] = rgbOf(hex).map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Rapporto di contrasto fra due colori (1..21). */
export function contrastRatio(a: string, b: string): number {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `a` spostato verso `b` della quota `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
    const A = rgbOf(a);
    const B = rgbOf(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * t));
}

export function isDarkPage(bg: string): boolean {
    return lum(bg) < DARK_PAGE_LUM;
}

/**
 * Corregge `c` finché fa almeno `target`:1 contro ogni colore di `against`,
 * spingendolo verso il nero (o il bianco se il primo fondo è scuro).
 */
export function fixContrast(c: string, against: readonly string[], target = 4.5): string {
    const worst = (x: string) => Math.min(...against.map(a => contrastRatio(x, a)));
    if (worst(c) >= target) return c;
    const toward = lum(against[0]) > DARK_PAGE_LUM ? "#000000" : "#FFFFFF";
    for (let t = 0.02; t <= 1; t += 0.02) {
        const m = mix(c, toward, t);
        if (worst(m) >= target) return m;
    }
    return toward;
}

/** Testo sopra un pulsante di colore `c`: bianco o quasi nero. */
export function onColor(c: string): string {
    return contrastRatio(c, "#FFFFFF") >= contrastRatio(c, "#111111") ? "#FFFFFF" : "#111111";
}

/** Scuro nel tono della pagina: stessa tinta, saturazione al massimo 0,22, luminosità `l`. */
export function tintDark(hex: string, l = 0.11): string {
    const [r, g, b] = rgbOf(hex).map(v => v / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const d = mx - mn;
    let hue = 0;
    if (d) hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    const sl = d ? d / (1 - Math.abs(mx + mn - 1)) : 0;
    const sat = Math.min(sl, 0.22);
    const C = (1 - Math.abs(2 * l - 1)) * sat;
    const X = C * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = l - C / 2;
    const [a, b2, c] =
        hue < 60 ? [C, X, 0] : hue < 120 ? [X, C, 0] : hue < 180 ? [0, C, X] : hue < 240 ? [0, X, C] : hue < 300 ? [X, 0, C] : [C, 0, X];
    return toHex([a, b2, c].map(v => (v + m) * 255)).toUpperCase();
}

/** Colore del contorno: automatico (grigio su pagina chiara, bianco su scura) o il principale. */
export function borderColor(usePrimary: boolean, bg: string, primary: string): string {
    if (usePrimary) return primary;
    return isDarkPage(bg) ? "rgb(255 255 255 / 28%)" : mix(bg, INK_ON_LIGHT, 0.22);
}

/** Consiglio dell'editor per riquadro in cima e barra: chiari su pagine scure o quasi bianche e neutre. */
export function suggestedChrome(bg: string): "light" | "dark" {
    const v = rgbOf(bg);
    const L = lum(bg);
    const tint = Math.max(...v) - Math.min(...v);
    return L < DARK_PAGE_LUM || (L >= 0.85 && tint <= 12) ? "light" : "dark";
}
