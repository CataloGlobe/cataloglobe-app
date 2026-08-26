// Tema PDF derivato dai token stile (Stage 3). Solo colori/tipografia/radius:
// gli asset brand (logo/cover) arrivano in Stage 3b.
//
// Regola accenti: primary/primarySoft dai token. MAI `colors.accent` — è
// riservato ai CTA interattivi, inesistenti su carta.
import type { StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { borderRadiusToPx, contrastText } from "@/features/public/utils/mapStyleTokensToCssVars";

export type PdfTheme = {
    pageBg: string;
    /** Testo principale su pageBg — sempre leggibile (derivato, mai dai token). */
    ink: string;
    /** Variante attenuata di ink (mix verso il bg), per descrizioni/footer. */
    muted: string;
    /** Accento brand per header categoria — con guardia contrasto su pageBg. */
    primary: string;
    /** Accento diluito (~30% primary su bg) per hairline/dettagli. */
    primarySoft: string;
    /** Radius in pt (none/soft/rounded → 0/10/20). */
    radius: number;
    /** Valore token grezzo; la famiglia react-pdf la risolve pdfFonts. */
    fontFamily: StyleTokenModel["typography"]["fontFamily"];
    /** True se la guardia contrasto ha sostituito primary con ink. */
    primaryContrastFallback: boolean;
};

function parseHex(hex: string): { r: number; g: number; b: number } | null {
    const clean = hex.trim().replace(/^#/, "");
    const full =
        clean.length === 3
            ? clean.split("").map(c => c + c).join("")
            : clean;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16)
    };
}

/** Mix solido fg-su-bg (react-pdf preferisce hex pieni alle alpha). */
function mixHex(bgHex: string, fgHex: string, amount: number): string {
    const bg = parseHex(bgHex);
    const fg = parseHex(fgHex);
    if (!bg || !fg) return fgHex;
    const ch = (b: number, f: number) => Math.round(b + (f - b) * amount);
    const to2 = (n: number) => n.toString(16).padStart(2, "0");
    return `#${to2(ch(bg.r, fg.r))}${to2(ch(bg.g, fg.g))}${to2(ch(bg.b, fg.b))}`;
}

function relativeLuminance(hex: string): number {
    const rgb = parseHex(hex);
    if (!rgb) return 0;
    const lin = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
    return (hi + 0.05) / (lo + 0.05);
}

/** Sotto questo rapporto un colore di heading su carta non è leggibile. */
const MIN_PRIMARY_CONTRAST = 2.5;

export function buildPdfTheme(tokens: StyleTokenModel): PdfTheme {
    const pageBg = tokens.colors.pageBackground;

    // contrastText garantisce bianco/near-black leggibile; lieve blend verso il
    // bg (stessa ricetta della pagina pubblica) per un nero meno "stampato male".
    const inkBase = contrastText(pageBg);
    const ink = mixHex(pageBg, inkBase, 0.88);
    const muted = mixHex(pageBg, ink, 0.55);

    const rawPrimary = tokens.colors.primary;
    const primaryReadable = contrastRatio(rawPrimary, pageBg) >= MIN_PRIMARY_CONTRAST;
    const primary = primaryReadable ? rawPrimary : ink;
    const primarySoft = mixHex(pageBg, primary, 0.3);

    return {
        pageBg,
        ink,
        muted,
        primary,
        primarySoft,
        radius: borderRadiusToPx(tokens.appearance.borderRadius),
        fontFamily: tokens.typography.fontFamily,
        primaryContrastFallback: !primaryReadable
    };
}
