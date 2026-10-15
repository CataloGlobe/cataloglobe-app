import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { LOOK_D } from "@/styles/lookD";

/**
 * La testata che si stringe scorrendo (D, come Recensioni e Clienti; v34 per
 * Menù e vetrina): uscito dalla vista il segnaposto in cima, la frase si
 * ritira e resta ferma la riga dei comandi. Torna intera solo di nuovo in
 * cima. Il passaggio usa le view transition, se ci sono e se il movimento
 * non è ridotto.
 */
export function useCompactHead() {
    const [compact, setCompact] = useState(false);
    const [top, setTop] = useState<HTMLDivElement | null>(null);
    const compactRef = useRef(false);

    useEffect(() => {
        if (!LOOK_D || !top) return;
        const swap = (next: boolean) => {
            if (compactRef.current === next) return;
            compactRef.current = next;
            const apply = () => flushSync(() => setCompact(next));
            const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!still && typeof document.startViewTransition === "function") document.startViewTransition(apply);
            else apply();
        };
        const io = new IntersectionObserver(
            ([e]) => {
                if (!e.isIntersecting) swap(true);
                else if (e.intersectionRatio >= 0.99) swap(false);
            },
            { threshold: [0, 1] }
        );
        io.observe(top);
        return () => io.disconnect();
    }, [top]);

    return { compact, setTop };
}
