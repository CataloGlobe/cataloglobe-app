import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** `prefers-reduced-motion: reduce`, aggiornato se l'utente lo cambia. */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(
        () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches
    );

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia(QUERY);
        const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);

    return reduced;
}
