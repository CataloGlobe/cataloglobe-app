import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
    if (typeof window.matchMedia !== "function") return () => undefined;
    const mq = window.matchMedia(QUERY);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
}

const getSnapshot = () => typeof window.matchMedia === "function" && window.matchMedia(QUERY).matches;

// L'HTML prerenderizzato non conosce la preferenza: idrata con `false`, poi
// React passa da solo al valore del browser (nessun mismatch di idratazione).
const getServerSnapshot = () => false;

/** `prefers-reduced-motion: reduce`, aggiornato se l'utente lo cambia. */
export function useReducedMotion(): boolean {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
