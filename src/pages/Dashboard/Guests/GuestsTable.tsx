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
import type { ReservationGuestSummary } from "@/types/reservationGuest";
import { visibilityFootnote } from "@/utils/guestVisibilityCopy";
import { formatVisitDate } from "./guestFormat";
import styles from "./Guests.module.scss";

interface Props {
    guests: ReservationGuestSummary[];
    isLoading: boolean;
    isSearching: boolean;
    onOpenGuest: (guest: ReservationGuestSummary) => void;
    tenantWide: boolean;
}

export default function GuestsTable({
    guests,
    isLoading,
    isSearching,
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
            cell: (_v, row) => <span className={styles.tableName}>{row.display_name}</span>,
            width: "minmax(160px, 1.4fr)"
        },
        {
            id: "phone",
            header: "Telefono",
            accessor: row => row.phone_e164,
            cell: (_v, row) => <span className={styles.tablePhone}>{row.phone_e164}</span>,
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
            // Zero resta grigio: solo il valore che cambia una decisione si
            // colora.
            cell: (_v, row) =>
                row.visible_no_shows > 0 ? (
                    <span className={styles.tableAbsence}>{row.visible_no_shows}</span>
                ) : (
                    <span className={styles.tableMuted}>0</span>
                )
        },
        {
            id: "last",
            header: "Ultima visita",
            accessor: row => row.last_visit_date ?? "",
            cell: (_v, row) => (
                <span className={styles.tableMuted}>{formatVisitDate(row.last_visit_date)}</span>
            ),
            width: "minmax(120px, 0.8fr)"
        },
        {
            id: "tags",
            header: "Marcature",
            accessor: row => row.tags.join(", "),
            cell: (_v, row) =>
                row.tags.length === 0 ? (
                    <span className={styles.tableMuted}>—</span>
                ) : (
                    <span className={styles.guestTags}>
                        {row.tags.map(t => (
                            <span key={t} className={styles.guestTag}>{t}</span>
                        ))}
                    </span>
                ),
            width: "minmax(140px, 1fr)"
        }
    ];

    return (
        <div className={styles.guestsWrap}>
            <DataTable<ReservationGuestSummary>
                data={guests}
                columns={columns}
                isLoading={isLoading}
                onRowClick={onOpenGuest}
                emptyState={{
                    title: isSearching ? "Nessun cliente trovato" : "Nessun cliente in rubrica",
                    description: isSearching
                        ? "Prova con un'altra parte del nome, o con il numero di telefono."
                        : "I clienti compaiono qui da soli: ogni prenotazione con un telefono leggibile crea o aggiorna la sua scheda."
                }}
            />

            {footnote && guests.length > 0 && (
                <p className={styles.guestsFootnote}>{footnote}</p>
            )}
        </div>
    );
}
