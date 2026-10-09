// Rubrica clienti — vista tabella.
//
// Alternativa all'elenco a righe, non sostituto: le righe servono a
// riconoscere una persona a colpo d'occhio, la tabella a confrontare molte
// persone sulla stessa colonna ("chi è quello con più assenze?"). Il
// selettore vive nell'header, la preferenza è ricordata dalla pagina.
//
// Usa `DataTable`, lo stesso componente delle altre liste del prodotto:
// paginazione, stato vuoto e larghezze colonna arrivano da lì. Nessuna
// colonna di selezione — non esistono azioni di gruppo in rubrica, per scelta.

import { DataTable, type ColumnDefinition } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import { visibilityFootnote } from "@/utils/guestVisibilityCopy";
import { formatPhoneForDisplay, formatVisitDate } from "./guestFormat";
import styles from "./Guests.module.scss";

interface Props {
    guests: ReservationGuestSummary[];
    /** Etichette per ospite: unione delle sedi visibili (sono per sede). */
    tagsByGuest: ReadonlyMap<string, string[]>;
    isLoading: boolean;
    /** Vedi `GuestsDirectory`: lo scheletro solo al primo giro, non a ogni ricerca. */
    hasLoadedOnce: boolean;
    isSearching: boolean;
    onClearSearch: () => void;
    onOpenGuest: (guest: ReservationGuestSummary) => void;
    tenantWide: boolean;
}

export default function GuestsTable({
    guests,
    tagsByGuest,
    isLoading,
    hasLoadedOnce,
    isSearching,
    onClearSearch,
    onOpenGuest,
    tenantWide
}: Props) {
    const footnote = visibilityFootnote(tenantWide);

    // Le intestazioni portano l'ambito una volta sola, in testa alla colonna:
    // ripeterlo su ogni cella ("3 visite nelle tue sedi" per riga) sarebbe
    // illeggibile in tabella, ma toglierlo del tutto rimetterebbe in circolo
    // numeri parziali spacciati per totali.
    const scopeSuffix = tenantWide ? "" : " (tue sedi)";

    const columns: ColumnDefinition<ReservationGuestSummary>[] = [
        {
            id: "name",
            header: "Nome",
            accessor: row => row.display_name,
            cell: (_v, row) => (
                <Text as="span" variant="body-sm" weight={500}>
                    {row.display_name}
                </Text>
            ),
            width: "minmax(160px, 1.4fr)"
        },
        {
            id: "phone",
            header: "Telefono",
            accessor: row => row.phone_e164,
            cell: (_v, row) => (
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {formatPhoneForDisplay(row.phone_e164)}
                </Text>
            ),
            width: "minmax(140px, 1fr)"
        },
        {
            id: "visits",
            header: `Visite${scopeSuffix}`,
            accessor: row => row.visible_visits,
            align: "right",
            width: "minmax(80px, 0.5fr)"
        },
        {
            id: "absences",
            header: `Assenze${scopeSuffix}`,
            accessor: row => row.visible_no_shows,
            align: "right",
            width: "minmax(90px, 0.5fr)",
            hideWithDetail: true,
            // Zero resta muto: solo il valore che cambia una decisione si
            // segna, come nell'elenco (StatusBadge ambra, C1).
            cell: (_v, row) =>
                row.visible_no_shows > 0 ? (
                    <StatusBadge variant="warning" label={String(row.visible_no_shows)} />
                ) : (
                    <Text as="span" variant="body-sm" colorVariant="muted">0</Text>
                )
        },
        {
            id: "last",
            header: "Ultima visita",
            accessor: row => row.last_visit_date ?? "",
            cell: (_v, row) => (
                <Text as="span" variant="body-sm" colorVariant="muted">
                    {formatVisitDate(row.last_visit_date)}
                </Text>
            ),
            width: "minmax(120px, 0.8fr)"
        },
        {
            id: "tags",
            header: "Etichette",
            accessor: row => (tagsByGuest.get(row.id) ?? []).join(", "),
            cell: (_v, row) =>
                (tagsByGuest.get(row.id) ?? []).length === 0 ? (
                    <Text as="span" variant="body-sm" colorVariant="muted">—</Text>
                ) : (
                    <span className={styles.tags}>
                        {(tagsByGuest.get(row.id) ?? []).map(t => (
                            <Badge key={t} variant="neutral">{t}</Badge>
                        ))}
                    </span>
                ),
            width: "minmax(140px, 1fr)",
            hideWithDetail: true
        }
    ];

    return (
        <div className={styles.guestsWrap}>
            <DataTable<ReservationGuestSummary>
                data={guests}
                columns={columns}
                ariaLabel="Clienti"
                isLoading={isLoading && !hasLoadedOnce}
                onRowClick={onOpenGuest}
                isFiltered={isSearching}
                onClearFilters={onClearSearch}
                emptyState={{
                    title: isSearching ? "Nessun cliente trovato" : "Nessun cliente in rubrica",
                    description: "I clienti compaiono qui da soli: ogni prenotazione con un telefono leggibile crea o aggiorna la sua scheda."
                }}
            />

            {footnote && guests.length > 0 && (
                <Text as="p" variant="caption" colorVariant="muted">
                    {footnote}
                </Text>
            )}
        </div>
    );
}
