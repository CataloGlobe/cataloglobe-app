import { useCallback } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

/** Segno nello stato della history: questa voce l'ha aggiunta l'apertura di un dettaglio. */
const OPENED_HERE = "detailOpened";

/**
 * Il dettaglio dal vivo nell'indirizzo (D131): `comande?ordine=<id>`. Il link
 * si può mandare a un collega, e «indietro» del browser chiude il dettaglio.
 *
 * Aprire da chiuso aggiunge una voce alla history; passare a un altro
 * elemento con il dettaglio aperto la sostituisce (↑ ↓ non riempiono la
 * history); chiudere torna indietro se la voce è nostra, altrimenti toglie
 * il parametro sul posto (dettaglio aperto da un link).
 */
export function useDetailParam(
    key: string,
    /**
     * Gli altri dettagli della stessa pagina (l'Elenco apre prenotazioni e
     * tavolate): aprendo questo si chiudono, e passare dall'uno all'altro è
     * come passare a un altro elemento.
     */
    siblings: readonly string[] = []
): [string | null, (id: string) => void, () => void] {
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const navigate = useNavigate();
    const current = searchParams.get(key);
    const anyOpen = current !== null || siblings.some(k => searchParams.has(k));
    const siblingsKey = siblings.join(",");
    const openedHere = (location.state as Record<string, unknown> | null)?.[OPENED_HERE] === true;

    const open = useCallback(
        (id: string) => {
            setSearchParams(
                prev => {
                    const next = new URLSearchParams(prev);
                    for (const k of siblingsKey ? siblingsKey.split(",") : []) next.delete(k);
                    next.set(key, id);
                    return next;
                },
                anyOpen ? { replace: true, state: location.state } : { state: { ...(location.state as object), [OPENED_HERE]: true } }
            );
        },
        [key, siblingsKey, anyOpen, location.state, setSearchParams]
    );

    const close = useCallback(() => {
        if (!current) return;
        if (openedHere) {
            navigate(-1);
            return;
        }
        setSearchParams(
            prev => {
                const next = new URLSearchParams(prev);
                next.delete(key);
                return next;
            },
            { replace: true, state: location.state }
        );
    }, [key, current, openedHere, navigate, location.state, setSearchParams]);

    return [current, open, close];
}
