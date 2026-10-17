// L'aspetto dello stile nel tunnel (D186): conti sui colori e sulle sei parti.
// Niente schermo e niente database.
import type { CSSProperties } from "react";
import type { BackgroundPattern, BorderRadius, FontFamily, HeaderChrome, StylePreset, StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";

/** Il colore di un campione: va alla variabile `--c` che lo scss legge. */
export const ink = (c: string) => ({ "--c": c }) as CSSProperties;

export const LIGHT_BG = "#FFFFFF";
export const DARK_BG = "#0F172A";

const rgb = (hex: string): [number, number, number] | null => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (c: readonly number[]) => "#" + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
export const sameHex = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Luminanza relativa (WCAG). */
export function lum(h: string): number {
    const c = rgb(h);
    if (!c) return 1;
    const [r, g, b] = c.map(v => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const contrast = (a: string, b: string) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Sotto questa soglia i prezzi sullo sfondo si leggono male: l'avviso compare. */
export const READABLE = 3;
export const hardToRead = (l: StyleTokenModel) => contrast(l.colors.primary, l.colors.pageBackground) < READABLE;

/**
 * Il tono più vicino che si legge sullo sfondo. Prima verso il bianco o il nero,
 * quello che sullo sfondo si legge meglio; se non basta, dall'altra parte. Su
 * uno sfondo a metà (#9c9c9c) la soglia «scuro sotto 0,35» schiariva fino al
 * bianco e l'avviso restava (review #443).
 */
export function readable(color: string, bg: string): string {
    const c = rgb(color);
    if (!c) return color;
    const walk = (up: boolean) => {
        let x = c;
        for (let n = 0; n < 40 && contrast(hex(x), bg) < 4.5; n++) x = x.map(v => (up ? v + (255 - v) * 0.12 : v * 0.88)) as [number, number, number];
        return hex(x);
    };
    const first = contrast("#ffffff", bg) >= contrast("#000000", bg);
    const a = walk(first);
    if (contrast(a, bg) >= 4.5) return a;
    const b = walk(!first);
    return contrast(b, bg) > contrast(a, bg) ? b : a;
}

function hsl(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex([f(0) * 255, f(8) * 255, f(4) * 255]);
}
// dieci tinte per cinque toni, come la tavolozza di un foglio di calcolo
const HUES: readonly [number, number][] = [[220, 9], [0, 72], [22, 82], [40, 88], [135, 45], [172, 60], [212, 78], [243, 70], [272, 62], [330, 68]];
const TONES = { ink: [74, 60, 48, 38, 24], bg: [98, 95, 90, 20, 11] } as const;
export type PaletteKind = keyof typeof TONES;
export const palette = (kind: PaletteKind): string[] => TONES[kind].flatMap(l => HUES.map(([h, s]) => hsl(h, kind === "bg" ? (l > 50 ? s * 0.8 : s * 0.45) : s, l)));

/**
 * I colori di un logo, dai suoi punti (RGBA): i più presenti, diversi fra loro,
 * senza il bianco di fondo e senza i punti trasparenti.
 */
export function logoColors(px: ArrayLike<number>, max = 4): string[] {
    const by = new Map<number, [number, number, number, number]>();
    for (let i = 0; i + 3 < px.length; i += 4) {
        if (px[i + 3] < 128) continue;
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (r > 238 && g > 238 && b > 238) continue;
        const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const c = by.get(k) ?? [0, 0, 0, 0];
        c[0] += r;
        c[1] += g;
        c[2] += b;
        c[3] += 1;
        by.set(k, c);
    }
    const out: number[][] = [];
    for (const c of [...by.values()].sort((a, b) => b[3] - a[3])) {
        const v = [c[0] / c[3], c[1] / c[3], c[2] / c[3]];
        if (out.every(o => Math.abs(o[0] - v[0]) + Math.abs(o[1] - v[1]) + Math.abs(o[2] - v[2]) > 90)) out.push(v);
        if (out.length === max) break;
    }
    return out.map(hex);
}

/**
 * Le parti dell'aspetto, nell'ordine del pannello (editor stili, deciso da Lorenzo il 2026-10-17):
 * prima tutta la pagina (colori, materiale e forme, carattere), poi le parti dall'alto in basso.
 */
export type PartId = "colori" | "materiale" | "carattere" | "cima" | "categorie" | "evidenza" | "piatti";
export const PART_IDS: readonly PartId[] = ["colori", "materiale", "carattere", "cima", "categorie", "evidenza", "piatti"];
const PICK: Record<PartId, (l: StyleTokenModel) => unknown[]> = {
    colori: l => [l.colors.primary.toLowerCase(), (l.colors.accent ?? "").toLowerCase(), l.colors.pageBackground.toLowerCase(), l.header.chrome ?? "dark"],
    materiale: l => [l.appearance.cardTreatment, l.appearance.outlinedBorderColor ?? "auto", l.appearance.borderRadius, l.appearance.backgroundPattern, l.appearance.backgroundPattern === "none" ? "" : l.appearance.patternIntensity],
    carattere: l => [l.typography.fontFamily],
    cima: l => [l.header.showLogo, l.header.showCoverImage, l.header.showCatalogName, l.header.showAddress],
    categorie: l => [l.navigation.style],
    evidenza: l => [l.appearance.featuredStyle],
    piatti: l => [l.card.productStyle, l.card.compactLayoutStyle ?? "modern", l.card.contentDensity ?? "full", l.card.image.mode, l.card.image.position, l.card.categoryTitle ?? "dash", l.appearance.iconStyle ?? "plain"]
};
export const partKey = (l: StyleTokenModel, p: PartId) => JSON.stringify(PICK[p](l));
export const lookKey = (l: StyleTokenModel) => PART_IDS.map(p => partKey(l, p)).join("|");

/** Rimette una parte com'era in `was`, senza toccare le altre. */
export function restore(l: StyleTokenModel, was: StyleTokenModel, p: PartId) {
    const w = structuredClone(was);
    if (p === "colori") {
        l.colors = w.colors;
        if (w.header.chrome) l.header.chrome = w.header.chrome;
        else delete l.header.chrome;
    } else if (p === "materiale") {
        l.appearance.cardTreatment = w.appearance.cardTreatment;
        l.appearance.outlinedBorderColor = w.appearance.outlinedBorderColor;
        l.appearance.borderRadius = w.appearance.borderRadius;
        l.appearance.backgroundPattern = w.appearance.backgroundPattern;
        l.appearance.patternIntensity = w.appearance.patternIntensity;
    } else if (p === "carattere") l.typography = w.typography;
    else if (p === "cima") l.header = { ...w.header, chrome: l.header.chrome };
    else if (p === "categorie") l.navigation = w.navigation;
    else if (p === "evidenza") l.appearance.featuredStyle = w.appearance.featuredStyle;
    else {
        l.card = w.card;
        l.appearance.iconStyle = w.appearance.iconStyle;
    }
    if (p === "cima" && !l.header.chrome) delete l.header.chrome;
}

/**
 * Riquadro in cima e barra: quali consigliamo su questo sfondo (sim-v5 `autoHead`). Chiari
 * sulle pagine scure e su quelle bianche o grigie quasi senza tinta; scuri sulle chiare colorate.
 */
export function chromeAdvice(bg: string): HeaderChrome {
    const c = rgb(bg);
    if (!c) return "light";
    const l = lum(bg), tint = Math.max(...c) - Math.min(...c);
    return l < 0.18 || (l >= 0.85 && tint <= 12) ? "light" : "dark";
}

type Preset = {
    id: StylePreset;
    name: string;
    bg: string;
    primary: string;
    accent: string;
    font: FontFamily;
    radius: BorderRadius;
    put: (l: StyleTokenModel) => void;
};
export type DishKind = "card" | "modern" | "editorial" | "centered";
/** «Ogni piatto è»: il riquadro, o una delle tre righe. */
export const dishKind = (l: StyleTokenModel): DishKind => (l.card.productStyle === "compact" ? (l.card.compactLayoutStyle ?? "modern") : "card");
export const setDish = (l: StyleTokenModel, kind: DishKind) => {
    l.card.productStyle = kind === "card" ? "card" : "compact";
    if (kind === "card") delete l.card.compactLayoutStyle;
    else l.card.compactLayoutStyle = kind;
};
const forme = (l: StyleTokenModel, treat: StyleTokenModel["appearance"]["cardTreatment"], chrome: HeaderChrome, pattern: BackgroundPattern) => {
    l.appearance.cardTreatment = treat;
    l.appearance.outlinedBorderColor = "auto";
    l.header.chrome = chrome;
    l.appearance.backgroundPattern = pattern;
    l.appearance.patternIntensity = "medium";
};

/**
 * I sei stili pronti (deciso da Lorenzo il 2026-10-16, spec-app sezione 3): sono solo una
 * partenza, toccandone uno si scrivono tutte le sue scelte e `meta.preset`.
 */
export const PRESETS: readonly Preset[] = [
    { id: "cg", name: "CataloGlobe", bg: "#F6F6FA", primary: "#5558E0", accent: "#C85035", font: "inter", radius: "soft", put: l => (forme(l, "glass", "light", "glow"), (l.navigation.style = "tinted"), setDish(l, "card"), (l.card.image = { mode: "show", position: "right" })) },
    { id: "trattoria", name: "Terracotta e crema", bg: "#F7F0E3", primary: "#9A3A25", accent: "#2B2522", font: "lora", radius: "soft", put: l => (forme(l, "glass", "dark", "linen"), (l.navigation.style = "tabs"), setDish(l, "editorial")) },
    { id: "avorio", name: "Avorio e blu notte", bg: "#FAF7F0", primary: "#7A5C22", accent: "#14213D", font: "eb-garamond", radius: "none", put: l => (forme(l, "bordered", "light", "none"), (l.navigation.style = "tabs"), setDish(l, "centered")) },
    { id: "bistrot", name: "Burro e verde bottiglia", bg: "#FBF5E6", primary: "#2E5E4E", accent: "#A63D2F", font: "poppins", radius: "rounded", put: l => (forme(l, "bordered", "dark", "noise"), (l.navigation.style = "filled"), setDish(l, "card")) },
    { id: "salvia", name: "Salvia e carta", bg: "#F3F6F1", primary: "#3A6B4C", accent: "#1E2528", font: "raleway", radius: "rounded", put: l => (forme(l, "raised", "light", "none"), (l.navigation.style = "outline"), setDish(l, "modern")) },
    { id: "notte", name: "Notte e ottone", bg: "#17131A", primary: "#C9A45C", accent: "#C9A45C", font: "eb-garamond", radius: "soft", put: l => (forme(l, "glass", "dark", "noise"), (l.navigation.style = "outline"), setDish(l, "card")) }
];

/** Scrive uno stile pronto sull'aspetto: colori, carattere, angoli e le sue forme. */
export function applyPreset(l: StyleTokenModel, id: StylePreset) {
    const p = PRESETS.find(x => x.id === id);
    if (!p) return;
    l.colors.pageBackground = p.bg;
    l.colors.primary = p.primary;
    if (sameHex(p.accent, p.primary)) delete l.colors.accent;
    else l.colors.accent = p.accent;
    l.typography.fontFamily = p.font;
    l.appearance.borderRadius = p.radius;
    p.put(l);
    l.meta = { ...l.meta, preset: id };
}

/**
 * «Ritoccato»: lo stile di partenza è segnato ma qualcosa delle sue scelte è cambiato.
 * Si confronta solo ciò che lo stile pronto decide (foto, densità e il resto restano liberi).
 */
export function retouched(l: StyleTokenModel): boolean {
    const id = l.meta?.preset;
    if (!id) return false;
    const ref = structuredClone(l);
    applyPreset(ref, id);
    return lookKey(ref) !== lookKey(l);
}

/**
 * Lo stile da scrivere. Titolo, descrizione e pulsante dei contenuti in evidenza sono
 * del contenuto, non dello stile (Alex, 2026-10-11): salvando dal tunnel tornano visibili.
 */
export function cleanLook(l: StyleTokenModel): StyleTokenModel {
    const out = structuredClone(l);
    delete out.appearance.showFeaturedTitle;
    delete out.appearance.showFeaturedSubtitle;
    delete out.appearance.showFeaturedCta;
    if (out.colors.accent && sameHex(out.colors.accent, out.colors.primary)) delete out.colors.accent;
    return out;
}
/** Lo stile nascondeva qualcosa dei contenuti in evidenza: «Controlla» lo dice. */
export const hidFeatured = (l: StyleTokenModel) => l.appearance.showFeaturedTitle === false || l.appearance.showFeaturedSubtitle === false || l.appearance.showFeaturedCta === false;
