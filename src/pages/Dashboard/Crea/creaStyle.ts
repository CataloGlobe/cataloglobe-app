// Lo stile nel telefono del tunnel: i token veri dello stile (quello in onda,
// quello da cui si parte, quello che si sta facendo) e i caratteri da caricare.
import { useEffect, type CSSProperties } from "react";
import { DEFAULT_STYLE_TOKENS, parseTokens, serializeTokens, type FontFamily, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { buildSingleFamilyFontUrl } from "@/utils/publicFontUrl";
import type { V2Style } from "@/services/supabase/styles";
import type { PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { FONTS, type CardKey, type Tunnel } from "./creaModel";

export const FONT_CSS: Record<string, string> = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.css]));

export const tokensOf = (st: V2Style | null | undefined): StyleTokenModel => (st ? parseTokens(st.current_version?.config ?? {}) : DEFAULT_STYLE_TOKENS);

export const DARK_BG = "#0F172A";
export const LIGHT_BG = "#FFFFFF";

export function isDarkHex(hex: string): boolean {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return false;
    const n = parseInt(m[1], 16);
    return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) < 128;
}

const cardOf = (tk: StyleTokenModel): CardKey => (tk.card.productStyle === "compact" ? "compatti" : tk.card.image.mode === "hide" ? "lista" : "foto");

/** Le quattro scelte com'erano nello stile di partenza: il colore no, quello si sceglie. */
export const aspectOf = (tk: StyleTokenModel) => ({ dark: isDarkHex(tk.colors.pageBackground), font: tk.typography.fontFamily, card: cardOf(tk) });

/** Lo stile che si sta facendo: quello di partenza con le quattro scelte sopra. */
export function styleTokens(t: Tunnel, base: StyleTokenModel): StyleTokenModel {
    const tk = structuredClone(base);
    if (t.color) tk.colors.primary = t.color;
    if (t.dark !== isDarkHex(base.colors.pageBackground)) tk.colors.pageBackground = t.dark ? DARK_BG : LIGHT_BG;
    tk.typography.fontFamily = t.font;
    // la forma delle card si tocca solo se è cambiata: lo stile di partenza può averla più fine di queste tre
    if (t.card !== cardOf(base)) {
        tk.card.productStyle = t.card === "compatti" ? "compact" : "card";
        tk.card.image.mode = t.card === "lista" ? "hide" : "show";
    }
    return tk;
}

export const styleConfig = (t: Tunnel, base: StyleTokenModel) => serializeTokens(styleTokens(t, base));

/** Qualche piatto vero per il telefono: le prime sezioni del listino, due piatti l'una. */
export function sampleOf(pick: readonly PickProduct[], only?: ReadonlySet<string>, sections = 3) {
    const by = new Map<string, { name: string; dishes: { name: string; price: number | null }[] }>();
    for (const p of pick) {
        if (only && !only.has(p.id)) continue;
        const c = p.category?.trim() || "Piatti";
        const sec = by.get(c) ?? { name: c, dishes: [] };
        if (sec.dishes.length < 2) sec.dishes.push({ name: p.name, price: p.listPrice });
        by.set(c, sec);
    }
    return [...by.values()].slice(0, sections);
}

/** Carica i caratteri (quelli self-hosted della pagina pubblica); Inter c'è già. */
export function useFonts(tokens: readonly FontFamily[]) {
    const key = tokens.join(",");
    useEffect(() => {
        for (const tok of key.split(",")) {
            if (!tok || tok === "inter") continue;
            const href = buildSingleFamilyFontUrl(tok);
            if (!href || document.head.querySelector(`link[data-crea-font="${tok}"]`)) continue;
            const l = document.createElement("link");
            l.rel = "stylesheet";
            l.href = href;
            l.dataset.creaFont = tok;
            document.head.appendChild(l);
        }
    }, [key]);
}

/** I colori dello schermo: quelli dello stile, non quelli del back office. */
export function phoneVars(tk: StyleTokenModel): CSSProperties {
    const bg = tk.colors.pageBackground, dark = isDarkHex(bg), acc = tk.colors.primary;
    // il colore principale scuro su sfondo scuro non si leggerebbe: come nell'artifact si schiarisce
    const pacc = dark && isDarkHex(acc) ? "#e2e8f0" : acc;
    return {
        "--pbg": bg,
        "--ptx": dark ? "#f1f5f9" : "#0f172a",
        "--pmut": dark ? "#94a3b8" : "#64748b",
        "--pline": dark ? "#334155" : "#e2e8f0",
        "--pcard": dark ? "#1e293b" : "#ffffff",
        "--pacc": pacc,
        "--pon": isDarkHex(pacc) ? "#ffffff" : "#0f172a",
        "--pfont": FONT_CSS[tk.typography.fontFamily] ?? FONT_CSS.inter
    } as CSSProperties;
}
