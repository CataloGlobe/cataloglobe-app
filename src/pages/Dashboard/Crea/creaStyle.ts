// Lo stile nel telefono del tunnel: i token veri dello stile (quello in onda,
// quello da cui si parte, quello che si sta facendo) e i caratteri da caricare.
import { useEffect, type CSSProperties } from "react";
import { DEFAULT_STYLE_TOKENS, parseTokens, serializeTokens, type FontFamily, type StyleTokenModel } from "@/pages/Dashboard/Styles/Editor/StyleTokenModel";
import { buildSingleFamilyFontUrl } from "@/utils/publicFontUrl";
import type { V2Style } from "@/services/supabase/styles";
import type { PickProduct } from "@/pages/Dashboard/Programming/calendar/calendarDraft";
import { FONTS, type Tunnel } from "./creaModel";
import { DARK_BG, LIGHT_BG, cleanLook, lum } from "./stileLook";

export const FONT_CSS: Record<string, string> = Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f.css]));

export const tokensOf = (st: V2Style | null | undefined): StyleTokenModel => (st ? parseTokens(st.current_version?.config ?? {}) : DEFAULT_STYLE_TOKENS);

export { DARK_BG, LIGHT_BG };
export const isDarkHex = (hex: string) => /^#?[0-9a-f]{6}$/i.test(hex.trim()) && lum(hex) < 0.35;

/** Lo stile che si sta facendo e quello che si scrive (D186: tutto l'aspetto sta nel tunnel). */
export const styleTokens = (t: Tunnel): StyleTokenModel => t.look;
export const styleConfig = (t: Tunnel) => serializeTokens(cleanLook(t.look));

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
