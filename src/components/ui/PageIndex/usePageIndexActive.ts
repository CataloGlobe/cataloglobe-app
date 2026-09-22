import { useEffect, useState } from "react";

/**
 * La sezione corrente: la prima, nell'ordine della pagina, che ha il bordo
 * superiore dentro il terzo alto del viewport — oppure l'ultima passata.
 */
export function usePageIndexActive(ids: string[]): string | null {
    const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
    const key = ids.join("|");

    useEffect(() => {
        const elements = ids.map(id => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
        if (elements.length === 0) return;
        const pick = () => {
            const threshold = window.innerHeight / 3;
            let current = elements[0].id;
            for (const el of elements) {
                if (el.getBoundingClientRect().top <= threshold) current = el.id;
            }
            setActiveId(current);
        };
        const observer = new IntersectionObserver(pick, { threshold: [0, 0.25, 0.5, 0.75, 1] });
        elements.forEach(el => observer.observe(el));
        pick();
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);

    return activeId;
}
