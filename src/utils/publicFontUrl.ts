/**
 * Mappa token di stile `typography.fontFamily` → CSS self-hosted locale
 * (`public/fonts/public-css/public-<token>.css`, @font-face woff2 latin +
 * latin-ext, font-display: swap). Un file per famiglia, generato una tantum
 * dai pesi storici (vedi `docs/architecture.md` self-host fonts) — nessuna
 * richiesta runtime a fonts.googleapis.com/fonts.gstatic.com (GDPR: niente
 * IP del visitatore inviato a Google).
 *
 * Consumer:
 *   - `usePublicFontInjection` (runtime): fallback single-family quando il
 *     marker `#mw-font` non è presente nel DOM.
 *   - `api/_lib/publicFontUrl.ts`: COPIA per l'SSR (ssr-render inietta
 *     `#mw-font` nell'<head>), da tenere allineata. Il vecchio
 *     `middleware.ts` che lo importava è stato rimosso in a1315573.
 *
 * VINCOLO: modulo PURO — niente accesso a DOM/Node/process, così resta
 * allineabile 1:1 con la copia lato server.
 *
 * Italic: solo `inter` ha italic vero; le altre 8 famiglie usano
 * faux-italic, com'è sempre stato.
 */
const PUBLIC_FONT_TOKENS = new Set([
    "inter",
    "poppins",
    "montserrat",
    "josefin-sans",
    "raleway",
    "spectral",
    "lora",
    "eb-garamond",
    "patrick-hand"
]);

/**
 * Path locale del CSS self-hosted per la SOLA famiglia dello stile attivo.
 * Ritorna `null` se il token è assente o sconosciuto (payload corrotto /
 * versioni future): il chiamante non inietta nulla.
 */
export function buildSingleFamilyFontUrl(fontToken: unknown): string | null {
    if (typeof fontToken !== "string") return null;
    if (!PUBLIC_FONT_TOKENS.has(fontToken)) return null;
    return `/fonts/public-css/public-${fontToken}.css`;
}
