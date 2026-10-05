/**
 * Font della landing che servono solo sotto la piega: Caveat (note scritte a
 * mano) e Inter (domande delle FAQ). Il browser scarica un font appena trova
 * testo impaginato che lo usa, anche fuori schermo: con le @font-face
 * nell'HTML iniziale partivano insieme all'hero e gli toglievano banda.
 * Qui i fogli arrivano dopo l'evento load, quando il browser è libero
 * (font-display: swap invariato, nei fogli).
 */
const LATE_FONT_SHEETS = ["/fonts/app-campaign-late.css", "/fonts/app-inter.css"];

function appendSheets() {
    for (const href of LATE_FONT_SHEETS) {
        if (document.head.querySelector(`link[rel="stylesheet"][href="${href}"]`)) continue;
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        document.head.appendChild(link);
    }
}

/** Da chiamare in un effect: aggancia i fogli dopo load + idle. Ritorna la pulizia. */
export function loadLateFonts(): () => void {
    let idle: number | undefined;
    let timer: number | undefined;
    const schedule = () => {
        if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(appendSheets, { timeout: 2000 });
        else timer = window.setTimeout(appendSheets, 0);
    };

    if (document.readyState === "complete") schedule();
    else window.addEventListener("load", schedule, { once: true });

    return () => {
        window.removeEventListener("load", schedule);
        if (idle !== undefined) window.cancelIdleCallback(idle);
        window.clearTimeout(timer);
    };
}
