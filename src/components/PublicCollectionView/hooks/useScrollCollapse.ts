import { useEffect, useState } from "react";

/**
 * Restituisce true quando lo scroll supera il threshold (default 50px).
 * Usato dai FAB della pagina pubblica per collassarsi in forma compatta.
 * Usa requestAnimationFrame per throttle: evita jitter su mobile.
 */
export function useScrollCollapse(threshold = 50): boolean {
    const [isCollapsed, setIsCollapsed] = useState(false);

    useEffect(() => {
        let rafId: number | null = null;

        const handleScroll = () => {
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                setIsCollapsed(window.scrollY > threshold);
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
