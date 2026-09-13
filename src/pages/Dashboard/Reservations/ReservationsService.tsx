import { useEffect, useMemo, useState } from "react";
import {
    Armchair,
    ChevronDown,
    ChevronRight,
    Clock,
    Lock,
    MapPin,
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
import { seatingDisplayName, type ServiceBoard } from "./serviceBoard";
import styles from "./Reservations.module.scss";

// ── La schermata di servizio ──────────────────────────────────────────────
// Quella che l'host tiene aperta all'ingresso. In questa fase MOSTRA e APRE,
// non crea: le righe portano al drawer della prenotazione che esiste già,
// con i gesti che esistono già (arrivato / servizio concluso / annulla).
//
// Fuori da questa fase, per scelta e non per dimenticanza:
//   - aprire una tavolata senza prenotazione (walk-in) → 2.7
//   - correggere i coperti reali (`set_seating_party_size` esiste già lato
//     SQL e qui non ha chiamanti) → 2.7
//   - la tavolata aperta troppo a lungo (a staging ce n'è una da 28 ore senza
//     nessun segnale) → 2.7 (D6). Esiste solo perché manca la chiusura
//     automatica di fine giornata, e un avviso costruito adesso segnalerebbe
//     una condizione che la 2.7 rende impossibile. La soglia giusta non è
//     una durata — "più di X ore" è arbitrario, "ancora aperta dopo la
//     chiusura del locale" è un fatto, e la 2.7 deve comunque conoscere
//     l'orario di chiusura.
//   - realtime sullo SPOSTAMENTO di una tavolata (`seating_tables` non è
//     nella publication: aprire/chiudere/annullare propagano, spostare no)
//     → 2.7
//   - l'incontro con Ordini → Tavoli (`v_tables_with_state`) → BLOCCO 3
//
// Stati vuoti: si mostra quello che c'è. "In arrivo" e "Concluse" vuoti
// spariscono. "In sala adesso" è l'unico che tiene il proprio stato vuoto,
// perché è la domanda a cui la schermata risponde — se sparisse anche lui la
// pagina resterebbe bianca. E il testo dice "nessuna tavolata aperta", mai
// "nessun dato": chi non può vedere trova il gate di `seatings.read` più
// sopra, non una sala che sembra deserta.
//
// L'elemento cliccabile è il NOME, mai la riga. Una riga che sembra uguale
// ovunque ma a volte non fa niente insegna a non fidarsi del click; con
// l'affordance sul nome, zero, uno e molti nomi sono lo stesso comportamento
// invece di tre eccezioni — e quando arriverà il drawer della tavolata la
// riga diventerà cliccabile ovunque senza abitudini da disimparare.

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
}

const TIME_FORMATTER = new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
});

function formatClock(iso: string): string {
    return TIME_FORMATTER.format(new Date(iso));
}

/** "da 45 min" · "da 1 h 20 min". Sotto il minuto: "da poco". */
function formatOpenFor(openedAtIso: string, now: Date): string {
    const ms = now.getTime() - new Date(openedAtIso).getTime();
    const totalMin = Math.floor(ms / 60_000);
    // "da poco", non "appena": stessa forma di "da 23 h 11 min" nella riga
    // accanto.
    if (totalMin < 1) return "da poco";
    if (totalMin < 60) return `da ${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m === 0 ? `da ${h} h` : `da ${h} h ${m} min`;
}

function formatCovers(n: number | null): string {
    // "non indicati", non "da dichiarare": il gesto per dichiararli non
    // esiste ancora (arriva nella 2.7), e una frase che suona come un invito
    // a fare qualcosa che non si può fare è una frase sbagliata.
    if (n === null) return "coperti non indicati";
    return `${n} ${n === 1 ? "coperto" : "coperti"}`;
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
    onOpenDetail
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

    const renderSeatingRow = (s: SeatingWithState, done: boolean) => {
        const labels = seatingTableLabels(s);
        const conflicts = done ? [] : (board.conflicts.get(s.id) ?? []);
        const removed = s.tables.filter(t => t.deleted_at !== null);
        return (
            <div key={s.id} className={done ? styles.serviceRowDone : styles.serviceRow}>
                <div className={styles.rowMain}>
                    <div className={styles.rowContent}>
                        <div className={styles.rowTopLine}>
                            {s.reservations.length === 0 ? (
                                // Il walk-in non è un caso di bordo: si dice,
                                // non si lascia vuoto. E non c'è niente da
                                // premere finché non esiste il suo drawer.
                                <span className={styles.serviceWalkinMark}>Senza prenotazione</span>
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
                                                    onClick={() => onOpenDetail(full)}
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
                                <Users size={13} strokeWidth={2} aria-hidden />{" "}
                                {formatCovers(s.party_size)}
                                <span className={styles.todayBarSeparator}> · </span>
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
