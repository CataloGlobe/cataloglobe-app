import { Search } from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge/StatusBadge";
import { statusMeta } from "@/utils/reservationStatusMeta";
import { SEARCH_RESULTS_LIMIT } from "@/utils/reservationSearch";
import type { V2Reservation } from "@/types/reservation";
import ChannelMark from "./ChannelMark";
import styles from "./Reservations.module.scss";

/**
 * I risultati della ricerca per nome o telefono (FASE 5.2b). Non è una
 * quarta scheda: sostituisce il contenuto della scheda finché il campo in
 * testata ha del testo. Le righe coprono tutto il tempo, quindi la data sta
 * in evidenza — senza sarebbero illeggibili — e l'ordine è dalla più vicina
 * a oggi.
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
    if (items.length === 0) {
        return (
            <div className={styles.emptyState} aria-busy={isSearching}>
                <EmptyState
                    icon={<Search size={40} strokeWidth={1.5} />}
                    title={isSearching ? "Ricerca in corso…" : "Nessuna prenotazione trovata"}
                    description={
                        isSearching
                            ? undefined
                            : "Prova con una parte del nome, o con il numero di telefono anche senza prefisso."
                    }
                />
            </div>
        );
    }

    return (
        <div className={styles.searchResults} aria-busy={isSearching}>
            <p className={styles.searchCount} role="status">
                {items.length === 1 ? "1 prenotazione" : `${items.length} prenotazioni`}
                {isSearching ? " · aggiornamento…" : ""}
            </p>
            {truncated && (
                <p className={styles.inboxTruncated} role="status">
                    {SEARCH_TRUNCATED_TEXT}
                </p>
            )}
            <div className={styles.cards}>
                {items.map(r => {
                    const badge = statusMeta(r.status);
                    return (
                        <div
                            key={r.id}
                            role="button"
                            tabIndex={0}
                            className={styles.searchRow}
                            onClick={() => onOpenDetail(r)}
                            onKeyDown={e => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    onOpenDetail(r);
                                }
                            }}
                        >
                            <div className={styles.searchDate}>
                                {formatFullDate(r.reservation_date)}
                                <span className={styles.searchTime}>
                                    {r.reservation_time.slice(0, 5)}
                                </span>
                            </div>
                            <div className={styles.rowMain}>
                                <ChannelMark source={r.source} />
                                <div className={styles.rowContent}>
                                    <div className={styles.rowTopLine}>
                                        <span className={styles.rowName}>{r.customer_name}</span>
                                        <span className={styles.rowMeta}>
                                            {r.party_size}{" "}
                                            {r.party_size === 1 ? "persona" : "persone"} ·{" "}
                                            {r.customer_phone}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className={styles.rowRight}>
                                <StatusBadge variant={badge.variant} label={badge.label} />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
