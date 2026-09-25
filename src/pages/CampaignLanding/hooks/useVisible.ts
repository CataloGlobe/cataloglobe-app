import { useEffect, useState, type RefObject } from "react";

/**
 * `true` finché l'elemento è sullo schermo e la scheda del browser è in primo
 * piano. A differenza di `useInView` segue entrate e uscite: serve ai cicli
 * che vanno messi in pausa fuori vista.
 * Senza IntersectionObserver (browser vecchi) conta solo la scheda.
 */
export function useVisible(ref: RefObject<Element | null>, threshold = 0.15): boolean {
    const [onScreen, setOnScreen] = useState(() => typeof IntersectionObserver === "undefined");
    const [pageShown, setPageShown] = useState(() => typeof document === "undefined" || !document.hidden);

    useEffect(() => {
        const el = ref.current;
        if (!el || typeof IntersectionObserver === "undefined") return;
        const io = new IntersectionObserver((entries) => setOnScreen(entries[entries.length - 1].isIntersecting), { threshold });
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
