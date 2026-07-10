import { useEffect } from "react";

/**
 * Avviso nativo del browser (refresh / chiusura tab) quando ci sono modifiche
 * non salvate. Non può mostrare un dialog custom — solo il prompt nativo.
 * Il guard di navigazione SPA (cambio route interno) è separato: richiede un
 * data router per `useBlocker`, non disponibile con l'attuale `<BrowserRouter>`.
 */
export function useBeforeUnloadWarning(when: boolean) {
    useEffect(() => {
        if (!when) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Alcuni browser richiedono returnValue impostato per mostrare il prompt.
            e.returnValue = "";
        };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [when]);
}
