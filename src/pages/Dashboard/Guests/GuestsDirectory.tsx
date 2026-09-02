// Rubrica clienti — elenco a righe.
//
// Righe delimitate dentro un contenitore unico, non card staccate: sono voci
// di un archivio omogeneo, e la card per riga aggiungerebbe un bordo e
// un'ombra per ogni cliente senza aggiungere informazione.
//
// Gerarchia della riga: iniziale → nome (+ marcatura principale) → telefono
// sotto → a destra visite e ultima visita. Le assenze compaiono in riga come
// pill rossa SOLO se > 0: è il dato che fa decidere se richiamare, e deve
// essere visibile senza aprire la scheda. Una pill "0 assenze" su ogni riga
// renderebbe invisibile proprio il caso che conta.
//
// Cosa NON c'è, di proposito: nessun pulsante di esportazione, nessuna
// selezione multipla, nessuna azione di invio. La rubrica serve a erogare il
// servizio, non a fare campagne: il consenso per quello non lo raccogliamo.
//
// I conteggi dipendono da chi guarda (view `security_invoker`): l'ambito è
// esplicitato riga per riga da `formatVisitCount`, e la nota in fondo spiega
// perché due colleghi possono leggere numeri diversi.

import { useMemo } from "react";
import { BookUser } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import {
    formatAbsenceCount,
    formatVisitCount,
    visibilityFootnote
} from "@/utils/guestVisibilityCopy";
import { formatVisitDate, guestInitial } from "./guestFormat";
import styles from "./Guests.module.scss";

interface Props {
    guests: ReservationGuestSummary[];
    isLoading: boolean;
    /** C'è un termine di ricerca attivo: cambia solo il testo dello stato
     *  vuoto ("nessun risultato" vs "rubrica ancora vuota"). Il campo di
     *  ricerca vive nella barra azioni dell'header, non qui. */
    isSearching: boolean;
    onOpenGuest: (guest: ReservationGuestSummary) => void;
    /** `isTenantWide(permissions)`: owner/admin non hanno bisogno del "nelle tue sedi". */
    tenantWide: boolean;
}

export default function GuestsDirectory({
    guests,
    isLoading,
    isSearching,
    onOpenGuest,
    tenantWide
}: Props) {
    const footnote = useMemo(() => visibilityFootnote(tenantWide), [tenantWide]);

    if (isLoading) {
        return (
            <div className={styles.cards}>
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
            </div>
        );
    }

    if (guests.length === 0) {
        return (
            <div className={styles.emptyState}>
                <EmptyState
                    icon={<BookUser size={40} strokeWidth={1.5} />}
                    title={isSearching ? "Nessun cliente trovato" : "Nessun cliente in rubrica"}
                    description={
                        isSearching
                            ? "Prova con un'altra parte del nome, o con il numero di telefono."
                            : "I clienti compaiono qui da soli: ogni prenotazione con un telefono leggibile crea o aggiorna la sua scheda."
                    }
                />
            </div>
        );
    }

    return (
        <div className={styles.guestsWrap}>
            <ul className={styles.guestsList}>
                {guests.map(g => {
                    // Una sola marcatura in linea: è un'etichetta di
                    // riconoscimento, non l'elenco completo. Le altre stanno
                    // nella scheda, riassunte da un "+N".
                    const primaryTag = g.tags[0];
                    return (
                        <li key={g.id} className={styles.guestListItem}>
                            <button
                                type="button"
                                className={styles.guestRow}
                                onClick={() => onOpenGuest(g)}
                            >
                                <span className={styles.guestInitial} aria-hidden>
                                    {guestInitial(g.display_name)}
                                </span>

                                <span className={styles.guestMain}>
                                    <span className={styles.guestNameLine}>
                                        <span className={styles.guestName}>{g.display_name}</span>
                                        {primaryTag && (
                                            <span className={styles.guestTag}>{primaryTag}</span>
                                        )}
                                        {g.tags.length > 1 && (
                                            <span className={styles.guestTagMore}>
                                                +{g.tags.length - 1}
                                            </span>
                                        )}
                                    </span>
                                    <span className={styles.guestPhone}>{g.phone_e164}</span>
                                </span>

                                {g.visible_no_shows > 0 && (
                                    <span className={styles.guestAbsencePill}>
                                        {formatAbsenceCount(g.visible_no_shows, tenantWide)}
                                    </span>
                                )}

                                <span className={styles.guestStats}>
                                    <span className={styles.guestStatsVisits}>
                                        {formatVisitCount(g.visible_visits, tenantWide)}
                                    </span>
                                    <span className={styles.guestStatsLast}>
                                        ultima {formatVisitDate(g.last_visit_date)}
                                    </span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {footnote && <p className={styles.guestsFootnote}>{footnote}</p>}
        </div>
    );
}
