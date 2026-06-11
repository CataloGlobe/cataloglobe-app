/**
 * Mappa token di stile `typography.fontFamily` → spec Google Fonts CSS2
 * (famiglia + pesi). I pesi sono estratti dall'URL storico a 8 famiglie di
 * `loadPublicFonts.ts` e dal blocco Inter di `index.html`.
 *
 * Due consumer (fonte unica, NON duplicare):
 *   - `middleware.ts` (edge runtime): injection warm del solo font dello
 *     stile attivo nell'<head> servito.
 *   - `PublicCollectionPage` (runtime): fallback cold single-family quando
 *     il marker `#mw-font` non è presente nel DOM.
 *
 * VINCOLO: modulo PURO — niente accesso a DOM/Node/process, così resta
 * importabile dall'edge runtime del middleware.
 *
 * `inter` → null: Inter è già caricata render-blocking da `index.html`
 * (variable font, tutta l'app la usa come default); nessuna injection extra.
 */
const GOOGLE_FONT_SPEC: Record<string, string | null> = {
    inter: null,
    poppins: "Poppins:wght@400;500;600;700",
    montserrat: "Montserrat:wght@400;500;600",
    "josefin-sans": "Josefin+Sans:wght@400;500;600",
    raleway: "Raleway:wght@400;500;600",
    playfair: "Playfair+Display:ital,wght@0,400..900;1,400..900",
    lora: "Lora:wght@400;500;600",
    "cormorant-garamond": "Cormorant+Garamond:wght@400;500;600",
    caveat: "Caveat:wght@400;500;700"
};

/**
 * URL CSS2 Google Fonts per la SOLA famiglia dello stile attivo.
 * Ritorna `null` se il token è assente, sconosciuto (payload corrotto /
 * versioni future) o `inter` (già caricata da index.html): in tutti i casi
 * il chiamante non inietta nulla.
 */
export function buildSingleFamilyFontUrl(fontToken: unknown): string | null {
    if (typeof fontToken !== "string") return null;
    const spec = Object.prototype.hasOwnProperty.call(GOOGLE_FONT_SPEC, fontToken)
        ? GOOGLE_FONT_SPEC[fontToken]
        : null;
    if (!spec) return null;
    return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
}
