import { Navigate, useLocation } from "react-router-dom";

/**
 * La vecchia tab unica «Ordini e prenotazioni» (e prima «Canali»): dalle
 * correzioni UI (O1) sono due tab. Si apre Ordini al tavolo; l'ancora
 * `#prenotazioni` porta alle Prenotazioni, `#capienza` alla sua card.
 */
export default function OrdiniPrenotazioniRedirect() {
    const { hash } = useLocation();
    const toReservations = hash === "#prenotazioni" || hash === "#capienza";
    return (
        <Navigate
            to={{
                pathname: toReservations ? "../prenotazioni-online" : "../ordini-al-tavolo",
                hash: hash === "#capienza" ? hash : ""
            }}
            replace
            relative="path"
        />
    );
}
