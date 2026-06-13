import { useEffect, useRef, useState } from "react";

/**
 * Restituisce true quando lo scroll supera il threshold (default 50px).
 * Usato dai FAB della pagina pubblica per collassarsi in forma compatta.
 * Usa requestAnimationFrame per throttle: evita jitter su mobile.
 *
 * `freeze`: quando true, lo stato collapse NON viene aggiornato dallo scroll e
 * trattiene l'ultimo valore. Serve a evitare il flicker quando una sheet apre e
 * blocca lo scroll del body (window.scrollY torna a 0 → l'hook crederebbe di
 * essere in cima ed espanderebbe). Il flag è letto da un ref aggiornato in modo
 * SINCRONO ad ogni render, così vince gli scroll event che arrivano subito dopo
 * l'apertura (il body-lock fired nell'effect della sheet, dopo questo render).
 */
export function useScrollCollapse(threshold = 50, freeze = false): boolean {
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Aggiornato sincronicamente ad ogni render: già true prima degli scroll
    // event post-apertura sheet.
    const freezeRef = useRef(freeze);
    freezeRef.current = freeze;

    useEffect(() => {
        let rafId: number | null = null;

        const handleScroll = () => {
            if (freezeRef.current) return; // congelato: ignora gli update da scroll
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                if (!freezeRef.current) setIsCollapsed(window.scrollY > threshold);
                rafId = null;
            });
        };

        // Controllo iniziale: se la pagina è già scrollata al mount, appare già compatto
        handleScroll();

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => {
            window.removeEventListener("scroll", handleScroll);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [threshold]);

    return isCollapsed;
}
