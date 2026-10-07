import { FAQ } from "@/pages/CampaignLanding/content/landing";
import type { Variante } from "@pages/CampaignLanding/variant";

/**
 * Prerender di `/` e `/b`: logica pura, senza React né file system, usata da
 * `src/entry-landing-server.tsx` al build e provata in `src/tests/landing/`.
 */

/** Il contenitore vuoto di `landing.html`, dove va l'HTML della pagina. */
export const LANDING_ROOT_MARKER = '<div id="root"><!--landing-ssr--></div>';

const CANONICAL_TAG = '<link rel="canonical" href="https://cataloglobe.com/" />';
const NOINDEX_TAG = '<meta name="robots" content="noindex" />';
const HEAD_CLOSE = "</head>";

type FaqItem = { q: string; a: string };

/** Dati strutturati `FAQPage` dalle stesse domande e risposte della sezione FAQ. */
export function faqPageLd(items: readonly FaqItem[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: items.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a }
        }))
    };
}

/**
 * Il blocco `<script>` del `FAQPage`. Porta `data-landing-ld` come gli altri
 * JSON-LD della landing, così non finisce mai su una pagina sede; `<` è
 * scritto `\u003c`, perché un testo non possa chiudere lo script.
 */
export function faqPageLdScript(items: readonly FaqItem[]): string {
    const json = JSON.stringify(faqPageLd(items), null, 2).replace(/</g, "\\u003c");
    return `<script type="application/ld+json" data-landing-ld>\n${json}\n</script>`;
}

/**
 * Il documento finale di una variante: HTML della pagina nel `#root`, con la
 * variante in `data-landing-prerender` (la legge l'idratazione, non l'URL). La variante
 * signup prende `noindex` nell'head; il canonical su `/` c'è già nel template.
 * La variante form prende il JSON-LD `FAQPage` prima di `</head>`.
 */
export function buildLandingDocument(template: string, appHtml: string, variante: Variante): string {
    if (!template.includes(LANDING_ROOT_MARKER)) {
        throw new Error(`[prerender-landing] manca ${LANDING_ROOT_MARKER} nel template`);
    }
    // Funzione di sostituzione: l'HTML può contenere `$&` e simili.
    let out = template.replace(LANDING_ROOT_MARKER, () => `<div id="root" data-landing-prerender="${variante}">${appHtml}</div>`);

    // Il FAQPage solo su /: /b è noindex e ripete le stesse domande.
    if (variante === "form") {
        if (!out.includes(HEAD_CLOSE)) {
            throw new Error(`[prerender-landing] manca ${HEAD_CLOSE} nel template`);
        }
        const script = faqPageLdScript(FAQ.items);
        out = out.replace(HEAD_CLOSE, () => `  ${script}\n  ${HEAD_CLOSE}`);
    }

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
