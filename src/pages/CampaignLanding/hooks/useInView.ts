import { useEffect, useState, type RefObject } from "react";

/**
 * `true` dal primo ingresso dell'elemento nello schermo (una volta sola).
 * Senza IntersectionObserver (browser vecchi) è `true` subito.
 */
export function useInView(ref: RefObject<Element | null>, threshold = 0.15): boolean {
    const [inView, setInView] = useState(() => typeof IntersectionObserver === "undefined");

    useEffect(() => {
        const el = ref.current;
        if (!el || inView) return;
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setInView(true);
                    io.disconnect();
                }
            },
            { threshold }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [ref, threshold, inView]);

    return inView;
}
