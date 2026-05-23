import { useEffect, useState } from "react";

/**
 * Hook reattivo per CSS media query.
 * Ritorna true se la query matcha la viewport corrente, false altrimenti.
 *
 * @example
 * const isMobile = useMediaQuery("(max-width: 767px)");
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() => {
        if (typeof window === "undefined") return false;
        return window.matchMedia(query).matches;
    });

    useEffect(() => {
        if (typeof window === "undefined") return;

        const mql = window.matchMedia(query);
        const handler = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        setMatches(mql.matches);

        mql.addEventListener("change", handler);
        return () => mql.removeEventListener("change", handler);
    }, [query]);

    return matches;
}
