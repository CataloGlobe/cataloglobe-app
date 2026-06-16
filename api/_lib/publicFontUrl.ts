/**
 * ⚠️ SYNC con src/utils/publicFontUrl.ts (usato da middleware.ts + frontend).
 * Duplicato qui perché @vercel/node non bundla import che risalgono fuori da api/.
 *
 * Mappa token di stile `typography.fontFamily` → spec Google Fonts CSS2
 * (famiglia + pesi). I pesi sono estratti dall'URL storico a 8 famiglie di
 * `loadPublicFonts.ts` e dal blocco Inter di `index.html`.
 *
 * VINCOLO: modulo PURO — niente accesso a DOM/Node/process.
 *
 * `inter` (Step 3a): spec statica 4 pesi + italic 400 (il public usa solo
 * 400/500/600/700 + font-style:italic a peso body — weight-check audit 3a).
 * Sul warm il middleware la inietta via mw-font e OMETTE il link shell
 * Inter variable (~73KB risparmiati); sul cold il runtime la SKIPPA perché
 * l'HTML originale contiene ancora l'Inter variable blocking di index.html.
 *
 * Italic: solo `playfair` (variable) e `inter` hanno italic vero; le altre
 * 7 famiglie usano faux-italic, com'è sempre stato nell'URL storico.
 */
const GOOGLE_FONT_SPEC: Record<string, string | null> = {
    inter: "Inter:ital,wght@0,400;0,500;0,600;0,700;1,400",
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
 * Ritorna `null` se il token è assente o sconosciuto (payload corrotto /
 * versioni future): il chiamante non inietta nulla.
 */
export function buildSingleFamilyFontUrl(fontToken: unknown): string | null {
    if (typeof fontToken !== "string") return null;
    const spec = Object.prototype.hasOwnProperty.call(GOOGLE_FONT_SPEC, fontToken)
        ? GOOGLE_FONT_SPEC[fontToken]
        : null;
    if (!spec) return null;
    return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
}
