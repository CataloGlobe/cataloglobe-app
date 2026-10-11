// Rubrica clienti — elenco a righe.
//
// Righe `ListRow` in un'unica `Card flush`, non card staccate: sono voci di un
// archivio omogeneo, e la card per riga aggiungerebbe un bordo per ogni
// cliente senza aggiungere informazione.
//
// Gerarchia della riga: iniziale → nome (+ etichetta principale) → telefono
// sotto → a destra le assenze e le visite. Le assenze compaiono SOLO se > 0,
// come `StatusBadge` ambra con la parola (C1, §50.14): è il dato che fa
// decidere se richiamare, e deve essere visibile senza aprire la scheda. Un
// «0 assenze» su ogni riga renderebbe invisibile proprio il caso che conta.
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
import { Avatar } from "@/components/ui/Avatar/Avatar";
import { Badge } from "@/components/ui/Badge/Badge";
import { Card } from "@/components/ui/Card/Card";
import { EmptyState } from "@/components/ui/EmptyState/EmptyState";
import { ListRow } from "@/components/ui/ListRow/ListRow";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import {
    formatAbsenceCount,
    formatVisitCount,
    visibilityFootnote
} from "@/utils/guestVisibilityCopy";
import { formatPhoneForDisplay, formatVisitDate } from "./guestFormat";
import styles from "./Guests.module.scss";

interface Props {
    guests: ReservationGuestSummary[];
    /** Etichette per ospite: unione delle sedi visibili (sono per sede). */
    tagsByGuest: ReadonlyMap<string, string[]>;
    isLoading: boolean;
    /**
     * Il primo caricamento è già avvenuto: da qui in poi un aggiornamento
     * trova dati in mano e non deve più sostituire l'elenco con lo scheletro.
     */
    hasLoadedOnce: boolean;
    /** C'è un termine di ricerca attivo: il vuoto è un risultato di filtro. */
    isSearching: boolean;
    onClearSearch: () => void;
    onOpenGuest: (guest: ReservationGuestSummary) => void;
    /** Il cliente aperto nel dettaglio accanto: la sua riga resta segnata. */
    selectedGuestId?: string | null;
    /** `isTenantWide(permissions)`: owner/admin non hanno bisogno del "nelle tue sedi". */
    tenantWide: boolean;
}

export default function GuestsDirectory({
    guests,
    tagsByGuest,
    isLoading,
    hasLoadedOnce,
    isSearching,
    onClearSearch,
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
        return isSearching ? (
            <EmptyState variant="filtered" title="Nessun cliente trovato" onClearFilters={onClearSearch} />
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
                {guests.map(g => {
                    // Una sola etichetta in linea: è un'etichetta di
                    // riconoscimento, non l'elenco completo. Le altre stanno
                    // nella scheda, riassunte da un "+N".
                    const tags = tagsByGuest.get(g.id) ?? [];
                    return (
                        <ListRow
                            key={g.id}
                            leading={<Avatar name={g.display_name} size="md" />}
                            title={
                                <span className={styles.nameLine}>
                                    <span className={styles.name}>{g.display_name}</span>
                                    {tags[0] && <Badge variant="neutral">{tags[0]}</Badge>}
                                    {tags.length > 1 && <Badge variant="outline">+{tags.length - 1}</Badge>}
                                </span>
                            }
                            subtitle={formatPhoneForDisplay(g.phone_e164)}
                            meta={
                                <span className={styles.rowMeta}>
                                    {g.visible_no_shows > 0 && (
                                        <StatusBadge
                                            variant="warning"
                                            label={formatAbsenceCount(g.visible_no_shows, tenantWide)}
                                        />
                                    )}
                                    <span className={styles.stats}>
                                        <Text as="span" variant="body-sm" weight={500}>
                                            {formatVisitCount(g.visible_visits, tenantWide)}
                                        </Text>
                                        <Text as="span" variant="caption" colorVariant="muted">
                                            ultima {formatVisitDate(g.last_visit_date)}
                                        </Text>
                                    </span>
                                </span>
                            }
                            onClick={() => onOpenGuest(g)}
                            selected={g.id === selectedGuestId}
                        />
                    );
                })}
            </Card>

            {footnote && (
                <Text as="p" variant="caption" colorVariant="muted">
                    {footnote}
                </Text>
            )}
        </div>
    );
}
