import type { MouseEvent, ReactNode } from "react";
import styles from "./Frame.module.scss";

type FrameProps = {
    /**
     * Barre fisse (navigazione). Renderizzate prima delle sezioni, come sorelle:
     * nessun antenato con `transform`, così `position: fixed` resta sulla finestra.
     */
    fixed?: ReactNode;
    children: ReactNode;
};

/**
 * Ancore interne (#contatto, #prezzi…) con scorrimento morbido. In JS e non con
 * `scroll-behavior: smooth` sul documento: il blocco dello scroll di PublicSheet
 * ripristina la posizione con `scrollTo`, che col CSS globale diventerebbe uno
 * scorrimento visibile alla chiusura dello sheet.
 */
function onAnchorClick(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as Element).closest("a");
    const hash = link?.getAttribute("href");
    if (!hash || !hash.startsWith("#") || hash.length < 2) return;
    const target = document.getElementById(hash.slice(1));
    if (!target) return;
    event.preventDefault();
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", hash);
}

/** Radice della landing: token, font, pagina bianca a tutta larghezza. */
export default function Frame({ fixed, children }: FrameProps) {
    return (
        // Delega del clic sulle ancore: i figli sono link veri, qui solo lo scorrimento.
        <div className={styles.landing} data-landing="" onClick={onAnchorClick}>
            {fixed}
            <main className={styles.page}>{children}</main>
        </div>
    );
}
