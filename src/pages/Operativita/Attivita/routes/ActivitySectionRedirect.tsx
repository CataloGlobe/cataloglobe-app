import { Navigate, useLocation } from "react-router-dom";
import type { ActivitySection } from "../ActivityDetailContext";

interface ActivitySectionRedirectProps {
    to: ActivitySection;
    /** L'ancora del vecchio indirizzo va portata al nuovo (`#ordini`). */
    keepHash?: boolean;
}

/**
 * Rimanda a una sezione della sede restando dentro la scheda. Due usi: il
 * vecchio «Canali», che ora si chiama Ordini e prenotazioni, e qualunque
 * segmento sconosciuto sotto la sede — un indirizzo vecchio o storto apre
 * l'Anagrafica, non la pagina «non trovata» di tutto il sito (stessa regola
 * dei vecchi `?tab=`).
 */
export default function ActivitySectionRedirect({ to, keepHash = false }: ActivitySectionRedirectProps) {
    const { hash } = useLocation();
    return <Navigate to={{ pathname: `../${to}`, hash: keepHash ? hash : "" }} replace relative="path" />;
}
