import { useEffect, useState, type RefObject } from "react";

/**
 * Margine degli ingressi (Reveal, bacheca): lo schermo conta fino al 12% dal
 * fondo, così un blocco basso parte quando è davvero in vista e non appena
 * sbuca dal bordo.
 */
export const ENTRY_ROOT_MARGIN = "0px 0px -12% 0px";

/**
 * `true` dal primo ingresso dell'elemento nello schermo (una volta sola):
 * almeno `threshold` dell'elemento dentro lo schermo, ristretto da
 * `rootMargin`. Con un margine, un blocco in fondo alla pagina che non può
 * salire abbastanza entra comunque quando la pagina è scrollata fino in fondo
 * e lui è a schermo.
 * Senza IntersectionObserver (browser vecchi) diventa `true` al montaggio.
 * Lo stato iniziale è sempre `false`: è quello dell'HTML prerenderizzato.
 */
export function useInView(ref: RefObject<Element | null>, threshold = 0.15, rootMargin?: string): boolean {
    const [inView, setInView] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || inView) return;
        if (typeof IntersectionObserver === "undefined") {
            setInView(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                // Il primo avviso arriva anche sotto soglia: conta il rapporto
                // (con un margine: al passaggio può arrivare arrotondato per difetto).
                if (entries.some((e) => e.isIntersecting && e.intersectionRatio >= threshold - 0.01)) {
                    setInView(true);
                }
            },
            { threshold, rootMargin }
        );
        io.observe(el);

        // Fondo pagina: il margine non si raggiunge più, basta essere a schermo.
        const atEnd = () => {
            if (!rootMargin) return;
            const doc = document.documentElement;
            const bottom = window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
            const rect = el.getBoundingClientRect();
            if (bottom && rect.top < window.innerHeight && rect.bottom > 0) setInView(true);
        };
        atEnd();
        window.addEventListener("scroll", atEnd, { passive: true });
        window.addEventListener("resize", atEnd);

        return () => {
            io.disconnect();
            window.removeEventListener("scroll", atEnd);
            window.removeEventListener("resize", atEnd);
        };
    }, [ref, threshold, rootMargin, inView]);

    return inView;
}
