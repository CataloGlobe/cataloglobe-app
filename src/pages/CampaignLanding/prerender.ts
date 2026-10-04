import type { Variante } from "@pages/CampaignLanding/variant";

/**
 * Prerender di `/` e `/b`: logica pura, senza React né file system, usata da
 * `src/entry-landing-server.tsx` al build e provata in `src/tests/landing/`.
 */

/** Il contenitore vuoto di `landing.html`, dove va l'HTML della pagina. */
export const LANDING_ROOT_MARKER = '<div id="root"><!--landing-ssr--></div>';

const CANONICAL_TAG = '<link rel="canonical" href="https://cataloglobe.com/" />';
const NOINDEX_TAG = '<meta name="robots" content="noindex" />';

/**
 * Il documento finale di una variante: HTML della pagina nel `#root`, con la
 * variante in `data-landing-prerender` (la legge l'idratazione, non l'URL). La variante
 * signup prende `noindex` nell'head; il canonical su `/` c'è già nel template.
 */
export function buildLandingDocument(template: string, appHtml: string, variante: Variante): string {
    if (!template.includes(LANDING_ROOT_MARKER)) {
        throw new Error(`[prerender-landing] manca ${LANDING_ROOT_MARKER} nel template`);
    }
    // Funzione di sostituzione: l'HTML può contenere `$&` e simili.
    let out = template.replace(LANDING_ROOT_MARKER, () => `<div id="root" data-landing-prerender="${variante}">${appHtml}</div>`);

    if (variante === "signup") {
        if (!out.includes(CANONICAL_TAG)) {
            throw new Error(`[prerender-landing] manca ${CANONICAL_TAG} nel template`);
        }
        out = out.replace(CANONICAL_TAG, () => `${NOINDEX_TAG}\n    ${CANONICAL_TAG}`);
    }
    return out;
}

/** Variante scritta dal prerender sul `#root`; `null` se la pagina non è prerenderizzata. */
export function prerenderedVariante(root: HTMLElement): Variante | null {
    const value = root.dataset.landingPrerender;
    return value === "form" || value === "signup" ? value : null;
}
