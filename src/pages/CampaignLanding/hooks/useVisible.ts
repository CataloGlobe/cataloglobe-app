import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * `true` finché l'elemento è sullo schermo (almeno `threshold`) e la scheda del
 * browser è in primo piano. A differenza di `useInView` segue entrate e
 * uscite: serve ai cicli che vanno messi in pausa fuori vista.
 *
 * `onExit` scatta quando l'elemento, dopo essere stato visto, esce del tutto
 * dallo schermo (nemmeno un pixel): lì le animazioni tornano all'inizio, così
 * al rientro ripartono da capo. Uno scroll piccolo non lo fa scattare.
 *
 * Senza IntersectionObserver (browser vecchi) conta solo la scheda.
 */
export function useVisible(ref: RefObject<Element | null>, threshold = 0.15, onExit?: () => void): boolean {
    const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === "undefined");
    const [pageShown, setPageShown] = useState(() => typeof document === "undefined" || !document.hidden);
    const exit = useRef(onExit);

    useEffect(() => {
        exit.current = onExit;
    });

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        let seen = false;
        const io = new IntersectionObserver(
            (entries) => {
                const e = entries[entries.length - 1];
                // Margine: al passaggio della soglia il rapporto può arrivare arrotondato per difetto.
                const on = e.isIntersecting && e.intersectionRatio >= threshold - 0.01;
                if (on) seen = true;
                setOnScreen(on);
                if (!e.isIntersecting && seen) {
                    seen = false;
                    exit.current?.();
                }
            },
            { threshold: [0, threshold] }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [ref, threshold]);

    useEffect(() => {
        const onChange = () => setPageShown(!document.hidden);
        document.addEventListener("visibilitychange", onChange);
        return () => document.removeEventListener("visibilitychange", onChange);
    }, []);

    return onScreen && pageShown;
}
