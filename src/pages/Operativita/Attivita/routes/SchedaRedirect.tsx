import { Navigate, useLocation } from "react-router-dom";
import { isSchedaPart, type SchedaPart } from "../scheda/schedaCopy";

interface SchedaRedirectProps {
    /** La parte dove è finita la vecchia sezione; senza, il cruscotto. */
    part?: SchedaPart;
}

/**
 * I vecchi indirizzi della scheda (orari, pubblicazione, come-lavorate,
 * ordini-al-tavolo, prenotazioni-online, ordini-prenotazioni, canali)
 * portano alla Scheda nuova (Officina 3, C+++): la parte a fuoco con
 * `?parte=`. Un'ancora che nomina una parte vince (`#ordini`,
 * `#prenotazioni`); `#capienza` apre le prenotazioni e resta, per la sua card.
 */
export default function SchedaRedirect({ part }: SchedaRedirectProps) {
    const { hash } = useLocation();
    const anchor = hash.slice(1);
    const target: SchedaPart | undefined =
        anchor === "capienza" ? "prenotazioni" : isSchedaPart(anchor) ? anchor : part;
    return (
        <Navigate
            to={{
                pathname: "../anagrafica",
                search: target ? `?parte=${target}` : "",
                hash: anchor === "capienza" ? hash : ""
            }}
            replace
            relative="path"
        />
    );
}
