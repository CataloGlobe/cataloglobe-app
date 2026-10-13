// Rubrica clienti — elenco (Clienti A, D154).
//
// Una riga per cliente, con le colonne che rispondono alle domande di prima
// del servizio: chi è (nome, segni, telefono, sedi), se torna (i pallini dei
// 12 mesi), quando è venuto l'ultima volta e se ha saltato, cosa sapere.
// Il clic apre la scheda accanto (D131).
//
// Le assenze compaiono SOLO se > 0, come `StatusBadge` ambra con la parola
// (C1, §50.14): un «0 assenze» su ogni riga renderebbe invisibile proprio il
// caso che conta.
//
// Cosa NON c'è, di proposito: nessun pulsante di esportazione, nessuna
// selezione multipla, nessuna azione di invio. La rubrica serve a erogare il
// servizio, non a fare campagne: il consenso per quello non lo raccogliamo.
//
// I conteggi dipendono da chi guarda (view `security_invoker`): l'ambito è
// esplicitato da `formatVisitCount`, e la nota in fondo spiega perché due
// colleghi possono leggere numeri diversi.

import { useMemo } from "react";
import { BookUser } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import { formatAbsenceCount, formatVisitCount, visibilityFootnote } from "@/utils/guestVisibilityCopy";
import { formatPhoneForDisplay, formatShortVisitDate } from "./guestFormat";
import { isNew, isRegular, type GuestActivity } from "./guestActivity";
import { MonthDots } from "./MonthDots";
import styles from "./Guests.module.scss";

interface Props {
    guests: ReservationGuestSummary[];
    /** Etichette per ospite: unione delle sedi visibili (sono per sede). */
    tagsByGuest: ReadonlyMap<string, string[]>;
    /** Pallini, visite dell'anno e sedi, dalle visite. */
    activityByGuest: ReadonlyMap<string, GuestActivity>;
    /** «Da sapere»: etichette e note in una riga. */
    knowByGuest: ReadonlyMap<string, string>;
    today: Date;
    isLoading: boolean;
    /**
     * Il primo caricamento è già avvenuto: da qui in poi un aggiornamento
     * trova dati in mano e non deve più sostituire l'elenco con lo scheletro.
     */
    hasLoadedOnce: boolean;
    /** Ricerca, filtro o sede attivi: il vuoto è un risultato di filtro. */
    isFiltered: boolean;
    onClearFilters: () => void;
    onOpenGuest: (guest: ReservationGuestSummary) => void;
    /** Il cliente aperto nel dettaglio accanto: la sua riga resta segnata. */
    selectedGuestId?: string | null;
    /** `isTenantWide(permissions)`: owner/admin non hanno bisogno del "nelle tue sedi". */
    tenantWide: boolean;
}

export default function GuestsDirectory({
    guests,
    tagsByGuest,
    activityByGuest,
    knowByGuest,
    today,
    isLoading,
    hasLoadedOnce,
    isFiltered,
    onClearFilters,
    onOpenGuest,
    selectedGuestId,
    tenantWide
}: Props) {
    const footnote = useMemo(() => visibilityFootnote(tenantWide), [tenantWide]);

    // SOLO al primo caricamento, quando non c'è ancora niente da mostrare.
    if (isLoading && !hasLoadedOnce) {
        return (
            <Card flush>
                <div aria-busy="true" aria-label="Caricamento clienti">
                    <ListRow loading />
                    <ListRow loading />
                    <ListRow loading />
                </div>
            </Card>
        );
    }

    if (guests.length === 0) {
        return isFiltered ? (
            <EmptyState variant="filtered" title="Nessun cliente trovato" onClearFilters={onClearFilters} />
        ) : (
            <EmptyState
                variant="inline"
                icon={<BookUser />}
                title="Nessun cliente in rubrica"
                description="I clienti compaiono qui da soli: ogni prenotazione con un telefono leggibile crea o aggiorna la sua scheda."
            />
        );
    }

    return (
        <div className={styles.guestsWrap}>
            <Card flush>
                <div className={styles.head} aria-hidden>
                    <span />
                    <span>Cliente</span>
                    <span>Ultimi 12 mesi</span>
                    <span>Ultima volta</span>
                    <span>Da sapere</span>
                </div>
                <ul className={styles.list} aria-label="Clienti">
                    {guests.map(g => {
                        const activity = activityByGuest.get(g.id);
                        const tags = tagsByGuest.get(g.id);
                        const sedi = activity?.sedi.map(s => s.name).join(" · ");
                        const know = knowByGuest.get(g.id);
                        return (
                            <li key={g.id}>
                                <button
                                    type="button"
                                    className={styles.row}
                                    aria-current={g.id === selectedGuestId ? "true" : undefined}
                                    onClick={() => onOpenGuest(g)}
                                >
                                    <Avatar name={g.display_name} size="md" />
                                    <span className={styles.who}>
                                        <span className={styles.nameLine}>
                                            <span className={styles.name}>{g.display_name}</span>
                                            {isRegular(activity, tags) && <span className={styles.sign}>abituale</span>}
                                            {isNew(g, today) && <span className={styles.sign}>nuovo</span>}
                                        </span>
                                        <span className={styles.phone}>
                                            {[formatPhoneForDisplay(g.phone_e164), sedi].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                    <span className={styles.year}>
                                        <MonthDots months={activity?.months} />
                                        <span className={styles.yearCount}>
                                            {formatVisitCount(activity?.visits12 ?? 0, tenantWide)}
                                        </span>
                                    </span>
                                    <span className={styles.last}>
                                        <span>{formatShortVisitDate(activity?.lastCame ?? g.last_visit_date, today)}</span>
                                        {g.visible_no_shows > 0 && (
                                            <StatusBadge
                                                variant="warning"
                                                label={formatAbsenceCount(g.visible_no_shows, tenantWide)}
                                            />
                                        )}
                                    </span>
                                    <span className={styles.know}>{know ?? "—"}</span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </Card>

            {footnote && (
                <Text as="p" variant="caption" colorVariant="muted">
                    {footnote}
                </Text>
            )}
        </div>
    );
}
