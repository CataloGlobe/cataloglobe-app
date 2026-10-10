import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/** Stato di navigazione per arrivare su un elenco col drawer di creazione aperto. */
export const CREATE_ON_ARRIVAL = { create: true } as const;

/**
 * «Cosa vuoi creare?» della Panoramica porta all'elenco con
 * `state: CREATE_ON_ARRIVAL`: qui si apre la creazione, una volta sola.
 * Lo stato si toglie subito (replace), così indietro o un ricarico non la
 * riaprono. `allowed` è null finché i permessi non sono arrivati; con false
 * si toglie lo stato e basta.
 */
export function useCreateOnArrival(open: () => void, allowed: boolean | null) {
    const location = useLocation();
    const navigate = useNavigate();
    const wants = (location.state as { create?: unknown } | null)?.create === true;

    useEffect(() => {
        if (!wants || allowed === null) return;
        navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
        if (allowed) open();
    }, [wants, allowed, open, navigate, location.pathname, location.search]);
}
