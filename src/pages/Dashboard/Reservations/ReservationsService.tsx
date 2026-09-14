import { useEffect, useMemo, useState } from "react";
import {
    Armchair,
    ChevronDown,
    ChevronRight,
    Clock,
    History,
    Lock,
    MapPin,
    Plus,
    TriangleAlert,
    Users
} from "lucide-react";
import { EmptyState } from "@components/ui/EmptyState/EmptyState";
import {
    TableAssignmentBadge,
    type TableAssignmentView
} from "@/components/ui/TableAssignmentBadge/TableAssignmentBadge";
import {
    compareTableLabels,
    formatTableLabels
} from "@/components/ui/TableAssignmentBadge/formatTableLabels";
import type { V2Reservation } from "@/types/reservation";
import type { SeatingWithState } from "@/types/seating";
import {
    PREVIOUS_SERVICE_LABEL,
    isFromPreviousService,
    seatingDisplayName,
    type ServiceBoard
} from "./serviceBoard";
import { formatCovers, formatOpenFor, seatingDrawerFor, walkinTitle } from "./seatingDrawer";
import { Button } from "@/components/ui/Button/Button";
import styles from "./Reservations.module.scss";

// ── La schermata di servizio ──────────────────────────────────────────────
// Quella che l'host tiene aperta all'ingresso. Mostra, apre e — dalla 2.7 —
// crea: "+ Senza prenotazione" apre una tavolata senza passare da una
// prenotazione finta, e il drawer della tavolata la corregge e la chiude.
//
// Dalla 2.8: la tavolata aperta in un servizio precedente (prima dell'ultima
// cinque del mattino) porta una riga di segnale (`isFromPreviousService`,
// stessa regola del cron che la chiuderà alla prossima passata), e le
// chiuse dal sistema NON stanno in "Concluse"
// (`composeServiceBoard`): il loro orario di chiusura non è un fatto di sala.
//
// Fuori da questa fase, per scelta e non per dimenticanza:
//   - collegare a posteriori un walk-in a una prenotazione ("avevamo
//     prenotato a un altro nome") → non ora: raro, e va progettato a parte.
//   - l'incontro con Ordini → Tavoli (`v_tables_with_state`) → BLOCCO 3
//
// Stati vuoti: si mostra quello che c'è. "In arrivo" e "Concluse" vuoti
// spariscono. "In sala adesso" è l'unico che tiene il proprio stato vuoto,
// perché è la domanda a cui la schermata risponde — se sparisse anche lui la
// pagina resterebbe bianca. E il testo dice "nessuna tavolata aperta", mai
// "nessun dato": chi non può vedere trova il gate di `seatings.read` più
// sopra, non una sala che sembra deserta.
//
// La RIGA è cliccabile ovunque e apre il drawer dell'entità che ha più da
// dire (`seatingDrawerFor`): quello della prenotazione se ce n'è una, quello
// della tavolata per un walk-in. I NOMI restano scorciatoie verso la singola
// prenotazione — con due prenotazioni sulla stessa tavolata, ogni nome apre
// la sua. Nessuna riga che sembra uguale alle altre e non fa niente.
//
// Per un walk-in i tavoli SONO il nome ("il sette"), non un'etichetta finta.

interface Props {
    /** `null` = non ancora caricato per questa sede. */
    board: ServiceBoard | null;
    /**
     * Nome della sede in scope. `null` = "Tutte le sedi": la vista di servizio
     * si tiene aperta su UNA sala, e qui si chiede di sceglierla.
     */
    activityName: string | null;
    /**
     * `seatings.read` sulla sede in scope. La view è `security_invoker` e a
     * chi non può leggere risponde con liste vuote, non con un errore: senza
     * questo gate "nessuno in sala" e "non puoi vederlo" sarebbero la stessa
     * schermata.
     */
    canRead: boolean;
    /** Prenotazioni della sede per id: i nomi in sala aprono il loro drawer. */
    reservationsById: ReadonlyMap<string, V2Reservation>;
    /** Piano tavoli delle prenotazioni in arrivo (badge). */
    tableViews: ReadonlyMap<string, TableAssignmentView>;
    onOpenDetail: (r: V2Reservation) => void;
    /** Apre il drawer della tavolata (walk-in). */
    onOpenSeating: (s: SeatingWithState) => void;
    /** "+ Senza prenotazione". Assente = nessun bottone (niente permesso). */
    onOpenWalkin?: () => void;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
});

function formatClock(iso: string): string {
    return TIME_FORMATTER.format(new Date(iso));
}

/** Etichette dei tavoli di una tavolata, in ordine umano. */
function seatingTableLabels(s: SeatingWithState): string[] {
    return [...s.tables].map(t => t.label).sort(compareTableLabels);
}

export default function ReservationsService({
    board,
    activityName,
    canRead,
    reservationsById,
    tableViews,
    onOpenDetail,
    onOpenSeating,
    onOpenWalkin
}: Props) {
    // "da 45 min" deve restare vero anche se non succede niente: un tick al
    // minuto, senza refetch. I dati cambiano via realtime, l'orologio da qui.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Le concluse stanno in coda e chiuse: servono a "a che ora si è liberato
    // il 4", non a stare in mezzo.
    const [closedOpen, setClosedOpen] = useState(false);

    // seating_id → nome, per dire CHI c'è dall'altra parte di un conflitto.
    const nameBySeatingId = useMemo(() => {
        const m = new Map<string, string>();
        for (const s of board?.inRoom ?? []) m.set(s.id, seatingDisplayName(s));
        return m;
    }, [board]);

    if (activityName === null) {
        return (
            <div className={styles.emptyState}>
                <EmptyState
                    icon={<MapPin size={40} strokeWidth={1.5} />}
                    title="Scegli una sede"
                    description="La vista di servizio segue una sala per volta. Seleziona la sede dalla barra in alto."
                />
            </div>
        );
    }

    if (!canRead) {
        return (
            <div className={styles.lockedWrap}>
                <EmptyState
                    icon={<Lock size={40} strokeWidth={1.5} />}
                    title="Non hai accesso al servizio di questa sede"
                    description="La vista di servizio è riservata ai membri con il permesso di lettura sulla sede. Contatta il proprietario o un amministratore se hai bisogno di accedere."
                />
            </div>
        );
    }

    if (board === null) {
        return (
            <div className={styles.cards}>
                <div className={styles.skeleton} />
                <div className={styles.skeleton} />
            </div>
        );
    }

    // La riga apre il drawer dell'entità che ha più da dire. Con più
    // prenotazioni, la prima; i nomi restano scorciatoie verso ciascuna.
    const openRow = (s: SeatingWithState) => {
        if (seatingDrawerFor(s) === "seating") {
            onOpenSeating(s);
            return;
        }
        const first = reservationsById.get(s.reservations[0].reservation_id);
        if (first) onOpenDetail(first);
        else onOpenSeating(s);
    };

    const renderSeatingRow = (s: SeatingWithState, done: boolean) => {
        const labels = seatingTableLabels(s);
        const conflicts = done ? [] : (board.conflicts.get(s.id) ?? []);
        const removed = s.tables.filter(t => t.deleted_at !== null);
        const isWalkin = s.reservations.length === 0;
        const covers = formatCovers(s.party_size);
        const stale = !done && isFromPreviousService(s, now);
        return (
            <div
                key={s.id}
                role="button"
                tabIndex={0}
                className={done ? styles.rowDimmed : styles.row}
                onClick={() => openRow(s)}
                onKeyDown={e => {
                    if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openRow(s);
                    }
                }}
            >
                <div className={styles.rowMain}>
                    <div className={styles.rowContent}>
                        <div className={styles.rowTopLine}>
                            {isWalkin ? (
                                // I tavoli sono il nome. Senza tavoli la riga
                                // vive di coperti e durata: è una tavolata di
                                // cui davvero si sa poco, e va bene che si veda.
                                <>
                                    {walkinTitle(s) !== null && (
                                        <span className={styles.rowName}>{walkinTitle(s)}</span>
                                    )}
                                    <span className={styles.serviceWalkinMark}>
                                        Senza prenotazione
                                    </span>
                                </>
                            ) : (
                                s.reservations.map((r, i) => {
                                    const full = reservationsById.get(r.reservation_id);
                                    return (
                                        <span key={r.reservation_id} className={styles.rowName}>
                                            {i > 0 && (
                                                <span className={styles.serviceNameSep} aria-hidden>
                                                    ·{" "}
                                                </span>
                                            )}
                                            {full ? (
                                                <button
                                                    type="button"
                                                    className={styles.serviceNameButton}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        onOpenDetail(full);
                                                    }}
                                                >
                                                    {r.customer_name}
                                                </button>
                                            ) : (
                                                r.customer_name
                                            )}
                                        </span>
                                    );
                                })
                            )}
                            <span className={styles.rowMeta}>
                                {covers !== null && (
                                    <>
                                        <Users size={13} strokeWidth={2} aria-hidden /> {covers}
                                        <span className={styles.todayBarSeparator}> · </span>
                                    </>
                                )}
                                <Clock size={13} strokeWidth={2} aria-hidden />{" "}
                                {done
                                    ? s.closed_at
                                        ? `liberato alle ${formatClock(s.closed_at)}`
                                        : "concluso"
                                    : formatOpenFor(s.opened_at, now)}
                            </span>
                        </div>
                        {removed.length > 0 && (
                            <div className={styles.rowMetaDim}>
                                {formatTableLabels(removed.map(t => t.label))}{" "}
                                {removed.length === 1 ? "rimosso" : "rimossi"} dalla sala
                            </div>
                        )}
                        {stale && (
                            // Di un servizio precedente: il cron la chiuderà
                            // alla prossima passata. Stessa forma del
                            // conflitto (una riga, non una banda), colore
                            // diverso: informa, non chiede un'azione. Da
                            // quanto lo dice la meta.
                            <div className={styles.serviceStale} role="status">
                                <History
                                    size={15}
                                    strokeWidth={2}
                                    aria-hidden
                                    className={styles.serviceStaleIcon}
                                />
                                <span>{PREVIOUS_SERVICE_LABEL}</span>
                            </div>
                        )}
                        {conflicts.length > 0 && (
                            <div className={styles.serviceConflict} role="status">
                                <TriangleAlert
                                    size={15}
                                    strokeWidth={2.25}
                                    aria-hidden
                                    className={styles.serviceConflictIcon}
                                />
                                <span>
                                    {conflicts
                                        .map(c => {
                                            const others = c.other_seating_ids
                                                .map(
                                                    id =>
                                                        nameBySeatingId.get(id) ??
                                                        "un'altra tavolata"
                                                )
                                                .join(", ");
                                            // Il fatto, non la coincidenza. Frammento:
                                            // niente punto finale.
                                            return `${formatTableLabels([c.label])} occupato anche da ${others}`;
                                        })
                                        .join(" · ")}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                {/* Per un walk-in i tavoli sono già il titolo: la colonna
                    destra non li ripete. */}
                {!isWalkin && (
                    <div className={styles.rowRight}>
                        <span
                            className={
                                conflicts.length > 0
                                    ? styles.serviceTablesConflict
                                    : styles.serviceTables
                            }
                        >
                            <Armchair size={13} strokeWidth={2} aria-hidden />
                            {labels.length > 0 ? formatTableLabels(labels) : "Nessun tavolo"}
                        </span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={styles.inbox}>
            {/* ── In sala adesso ──────────────────────────────────── */}
            <section className={styles.inboxSection}>
                <div className={styles.inboxSectionHeader}>
                    <h2 className={styles.inboxSectionTitle}>In sala adesso</h2>
                    {board.inRoom.length > 0 && (
                        <span className={styles.inboxSectionCount}>{board.inRoom.length}</span>
                    )}
                    {/* Qui e non nel PageHeader: lì vive "+ Nuova
                        prenotazione", condivisa con Inbox e Agenda, ed è
                        un'altra cosa. "Senza prenotazione" dice l'unica cosa
                        che lo distingue, ed è la parola che un host userebbe. */}
                    {onOpenWalkin && (
                        <Button
                            variant="secondary"
                            size="sm"
                            className={styles.serviceSectionAction}
                            leftIcon={<Plus size={14} />}
                            onClick={onOpenWalkin}
                        >
                            Senza prenotazione
                        </Button>
                    )}
                </div>
                {board.inRoom.length === 0 ? (
                    // "Nessuna tavolata aperta", NON "nessun dato": chi arriva
                    // qui ha passato il gate, quindi la sala è davvero vuota.
                    <p className={styles.inboxSectionHint}>
                        Nessuna tavolata aperta. Quando qualcuno si siede, compare qui.
                    </p>
                ) : (
                    <div className={styles.cards}>
                        {board.inRoom.map(s => renderSeatingRow(s, false))}
                    </div>
                )}
            </section>

            {/* ── In arrivo ───────────────────────────────────────── */}
            {board.arriving.length > 0 && (
                <section className={styles.inboxSection}>
                    <div className={styles.inboxSectionHeader}>
                        <h2 className={styles.inboxSectionTitle}>In arrivo</h2>
                        <span className={styles.inboxSectionCount}>{board.arriving.length}</span>
                    </div>
                    <div className={styles.cards}>
                        {board.arriving.map(({ reservation: r, late }) => {
                            const tableView = tableViews.get(r.id);
                            return (
                                <div key={r.id} className={styles.serviceRow}>
                                    <div className={styles.rowMain}>
                                        <span
                                            className={
                                                late ? styles.serviceTimeLate : styles.serviceTime
                                            }
                                        >
                                            {r.reservation_time.slice(0, 5)}
                                        </span>
                                        <div className={styles.rowContent}>
                                            <div className={styles.rowTopLine}>
                                                <span className={styles.rowName}>
                                                    <button
                                                        type="button"
                                                        className={styles.serviceNameButton}
                                                        onClick={() => onOpenDetail(r)}
                                                    >
                                                        {r.customer_name}
                                                    </button>
                                                </span>
                                                <span className={styles.rowMeta}>
                                                    {r.party_size}{" "}
                                                    {r.party_size === 1 ? "persona" : "persone"}
                                                </span>
                                                {late && (
                                                    // L'unica riga colorata del
                                                    // gruppo: segnala l'eccezione.
                                                    <span className={styles.serviceLateMark}>
                                                        In ritardo
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className={styles.rowRight}>
                                        {tableView && <TableAssignmentBadge view={tableView} />}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* ── Concluse ────────────────────────────────────────── */}
            {board.closed.length > 0 && (
                <section className={styles.inboxSection}>
                    <button
                        type="button"
                        className={styles.serviceClosedToggle}
                        aria-expanded={closedOpen}
                        onClick={() => setClosedOpen(v => !v)}
                    >
                        {closedOpen ? (
                            <ChevronDown size={16} strokeWidth={2} aria-hidden />
                        ) : (
                            <ChevronRight size={16} strokeWidth={2} aria-hidden />
                        )}
                        <h2 className={styles.inboxSectionTitle}>Concluse</h2>
                        <span className={styles.inboxSectionCount}>{board.closed.length}</span>
                    </button>
                    {closedOpen && (
                        <div className={styles.cards}>
                            {board.closed.map(s => renderSeatingRow(s, true))}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
