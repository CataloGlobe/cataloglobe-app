/**
 * Avvio anticipato della landing di campagna. Sta nel bundle principale (import
 * statico da App.tsx) e non importa nulla della landing staticamente.
 *
 * Senza questo il chunk parte solo quando React monta la route, e i font solo
 * quando arriva il CSS del chunk (che li importa via app-campaign.css): tre
 * attese in fila, con il segnaposto dell'hero a schermo.
 */

/** `/` e `/b`: le due varianti della landing (i vecchi `/landing-dev…` fanno 301 qui). */
const LANDING_PATH = /^\/(b\/?)?$/;

/** Font dell'hero (titolo e testo): gli stessi file di public/fonts/app-campaign.css. */
const HERO_FONTS = ["/fonts/app/young-serif-400-normal-latin.woff2", "/fonts/app/instrument-sans-400-700-normal-latin.woff2"];

let chunk: Promise<typeof import("@pages/CampaignLanding")> | null = null;

/** Import del chunk, condiviso con il `lazy()` della route: parte una volta sola. */
export function loadCampaignLanding() {
    chunk ??= import("@pages/CampaignLanding");
    return chunk;
}

function preloadFont(href: string) {
    if (document.head.querySelector(`link[rel="preload"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "font";
    link.type = "font/woff2";
    link.href = href;
    // I font si scaricano sempre in modalità CORS: senza, il preload non viene riusato.
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
}

/** Da chiamare al caricamento dell'app: se l'indirizzo è la landing, avvia chunk e font. */
export function preloadCampaignLandingIfLanding() {
    if (typeof window === "undefined" || !LANDING_PATH.test(window.location.pathname)) return;
    HERO_FONTS.forEach(preloadFont);
    void loadCampaignLanding();
}
