import { Navigate, useLocation } from "react-router-dom";

/**
 * «Canali» si chiamava così per una settimana: la pagina la aprono ordini e
 * prenotazioni, e il nome nuovo lo dice. Il vecchio indirizzo resta e porta
 * al nuovo, con l'ancora intatta (`#ordini`, `#prenotazioni`).
 */
export default function ActivityCanaliRedirect() {
    const { hash } = useLocation();
    return <Navigate to={{ pathname: "../ordini-prenotazioni", hash }} replace relative="path" />;
}
