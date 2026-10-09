import { Navigate, useLocation } from "react-router-dom";
import type { ActivitySection } from "../ActivityDetailContext";

interface ActivitySectionRedirectProps {
    to: ActivitySection;
    /** L'ancora del vecchio indirizzo va portata al nuovo (`#ordini`). */
    keepHash?: boolean;
    /** La query del vecchio indirizzo va portata al nuovo (`?vista=ingredienti`). */
    keepSearch?: boolean;
    /** L'ancora del blocco dove è finita la vecchia sezione (`orari`), se il
     *  vecchio indirizzo non ne porta una sua. */
    anchor?: string;
}

/**
 * Rimanda a una sezione della sede restando dentro la scheda. Due usi: il
 * vecchio «Canali», che ora si chiama Ordini e prenotazioni, e qualunque
 * segmento sconosciuto sotto la sede — un indirizzo vecchio o storto apre
 * l'Anagrafica, non la pagina «non trovata» di tutto il sito (stessa regola
 * dei vecchi `?tab=`).
 */
export default function ActivitySectionRedirect({ to, keepHash = false, keepSearch = false, anchor }: ActivitySectionRedirectProps) {
    const { hash, search } = useLocation();
    const nextHash = keepHash && hash ? hash : anchor ? `#${anchor}` : "";
    return (
        <Navigate
            to={{ pathname: `../${to}`, hash: nextHash, search: keepSearch ? search : "" }}
            replace
            relative="path"
        />
    );
}
