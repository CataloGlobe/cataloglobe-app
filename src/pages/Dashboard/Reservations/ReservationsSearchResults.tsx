import { Search } from "lucide-react";
import { DataTable, DATA_TABLE_CLASSES, type ColumnDefinition } from "@/components/ui/DataTable/DataTable";
import { InlineBanner } from "@/components/ui/InlineBanner/InlineBanner";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import Text from "@/components/ui/Text/Text";
import { statusMeta } from "@/utils/reservationStatusMeta";
import { SEARCH_RESULTS_LIMIT } from "@/utils/reservationSearch";
import type { V2Reservation } from "@/types/reservation";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

/**
 * I risultati della ricerca per nome o telefono (FASE 5.2b). Non è una
 * scheda: sostituisce il contenuto della scheda finché il campo in testata
 * ha del testo. È l'unico elenco senza un giorno che lo raggruppi, con
 * colonne da confrontare riga per riga: una `DataTable` (passo 2, P10). La
 * data porta l'anno — le righe coprono tutto il tempo — e l'ordine è dalla
 * più vicina a oggi.
 */
interface Props {
    /** Risultati già ordinati dal service (dalla più vicina a oggi). */
    items: V2Reservation[];
    /** True se il server ne ha più di `SEARCH_RESULTS_LIMIT`. */
    truncated: boolean;
    /** Richiesta in corso: si tiene la lista precedente, si segnala. */
    isSearching: boolean;
    onOpenDetail: (r: V2Reservation) => void;
}

// Il numero è la costante del modulo di ricerca, non una cifra scritta a
// mano: se il tetto cambia, il banner lo segue.
const SEARCH_TRUNCATED_TEXT = `Queste sono le ${SEARCH_RESULTS_LIMIT} prenotazioni più vicine a oggi. Ce ne sono altre: restringi la ricerca.`;

const DATE_FMT = new Intl.DateTimeFormat("it-IT", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
});

function formatFullDate(isoDate: string): string {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    return DATE_FMT.format(new Date(y, (m ?? 1) - 1, d ?? 1));
}

export default function ReservationsSearchResults({
    items,
    truncated,
    isSearching,
    onOpenDetail
}: Props) {
    const columns: ColumnDefinition<V2Reservation>[] = [
        {
            id: "when",
            header: "Data",
            accessor: r => r.reservation_date,
            // Data e ora in una cella: a 375 restano quando, chi e stato.
            cell: (_v, r) => (
                <div className={DATA_TABLE_CLASSES.cellTwoLine}>
                    <span>{formatFullDate(r.reservation_date)}</span>
                    <span>{r.reservation_time.slice(0, 5)}</span>
                </div>
            ),
            width: "minmax(120px, 1fr)"
        },
        {
            id: "name",
            header: "Nome",
            accessor: r => r.customer_name,
            // Il nome è un bottone: col mouse si apre tutta la riga, da
            // tastiera il nome (la riga di DataTable non prende il focus).
            cell: (_v, r) => (
                <span className={styles.searchName}>
                    <ChannelMark source={r.source} variant="plain" />
                    <button
                        type="button"
                        className={styles.searchNameButton}
                        onClick={() => onOpenDetail(r)}
                    >
                        {r.customer_name}
                    </button>
                </span>
            ),
            width: "minmax(120px, 1.6fr)"
        },
        {
            id: "party",
            header: "Persone",
            accessor: r => r.party_size,
            align: "right",
            width: "minmax(72px, 0.5fr)",
            hideOnPhone: true
        },
        {
            id: "phone",
            header: "Telefono",
            accessor: r => r.customer_phone,
            width: "minmax(130px, 1fr)",
            hideOnPhone: true
        },
        {
            id: "status",
            header: "Stato",
            accessor: r => r.status,
            cell: (_v, r) => {
                const badge = statusMeta(r.status);
                return <StatusBadge variant={badge.variant} label={badge.label} />;
            },
            width: "minmax(100px, 0.8fr)"
        }
    ];

    return (
        <div className={styles.searchResults} aria-busy={isSearching}>
            {items.length > 0 && (
                <Text as="p" variant="caption" colorVariant="muted" role="status">
                    {items.length === 1 ? "1 prenotazione" : `${items.length} prenotazioni`}
                    {isSearching ? " · aggiornamento…" : ""}
                </Text>
            )}
            {truncated && <InlineBanner variant="warning">{SEARCH_TRUNCATED_TEXT}</InlineBanner>}
            <DataTable<V2Reservation>
                data={items}
                columns={columns}
                isLoading={isSearching && items.length === 0}
                onRowClick={onOpenDetail}
                getRowId={r => r.id}
                emptyState={{
                    icon: <Search size={40} strokeWidth={1.5} />,
                    title: "Nessuna prenotazione trovata",
                    description: "Prova con una parte del nome, o con il numero di telefono anche senza prefisso."
                }}
            />
        </div>
    );
}
