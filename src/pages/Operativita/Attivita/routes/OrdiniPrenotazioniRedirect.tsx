import { Navigate, useLocation } from "react-router-dom";

/**
 * La vecchia tab unica «Ordini e prenotazioni» (e prima «Canali»): dalle
 * correzioni UI (O1) erano due tab, ora due blocchi di «Come lavorate» (Officina 3). Si va agli Ordini al tavolo; l'ancora
 * `#prenotazioni` porta alle Prenotazioni, `#capienza` alla sua card.
 */
export default function OrdiniPrenotazioniRedirect() {
    const { hash } = useLocation();
    const toReservations = hash === "#prenotazioni" || hash === "#capienza";
    return (
        <Navigate
            to={{
                pathname: "../come-lavorate",
                hash: hash === "#capienza" ? hash : toReservations ? "#prenotazioni" : "#ordini"
            }}
            replace
            relative="path"
        />
    );
}
