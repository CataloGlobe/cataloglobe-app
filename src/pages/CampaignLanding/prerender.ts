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

/** Il foglio di stile della landing come lo scrive Vite in `landing.html`. */
const STYLESHEET_LINK = /<link rel="stylesheet" crossorigin href="(\/assets\/[^"]+\.css)">/g;

/**
 * Sostituisce i `<link rel="stylesheet">` di Vite con il loro CSS in un
 * `<style>`, nello stesso punto dell'head (stessa cascata): il primo paint
 * non aspetta nessuna richiesta di CSS. `readCss` riceve l'href (`/assets/…`).
 */
export function inlineStylesheets(html: string, readCss: (href: string) => string): string {
    let count = 0;
    const out = html.replace(STYLESHEET_LINK, (_, href: string) => {
        count++;
        // @charset in un <style> non vale niente: il documento è già UTF-8.
        const css = readCss(href).replace(/^@charset "UTF-8";/, "");
        if (/<\/style/i.test(css)) throw new Error(`[prerender-landing] ${href} contiene </style>`);
        return `<style data-href="${href}">${css}</style>`;
    });
    if (count === 0) throw new Error("[prerender-landing] nessun foglio di stile da mettere inline");
    return out;
}
