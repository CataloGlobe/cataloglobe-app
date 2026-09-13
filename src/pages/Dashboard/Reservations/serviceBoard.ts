// La schermata di servizio, ridotta alle sue regole: come si compongono i tre
// gruppi (in sala / in arrivo / concluse), quando un'attesa è in ritardo, e
// quando due tavolate aperte si contendono lo stesso tavolo.
//
// Logica pura e fuori dal JSX apposta: sono regole, e le regole si testano.
// Stesso criterio di `tableSection.ts` e `seatingActions.ts`.

import type { V2Reservation } from "@/types/reservation";
import type { SeatingWithState } from "@/types/seating";

/**
 * Minuti oltre l'orario prenotato dopo i quali un'attesa è "in ritardo".
 *
 * Non zero: alle 20:03 la prenotazione delle 20:00 non è un'eccezione, è la
 * normalità di una sala. Il colore deve segnalare SOLO l'eccezione, quindi la
 * soglia deve stare oltre il rumore ordinario.
 */
export const LATE_GRACE_MINUTES = 15;

export interface ArrivingReservation {
    reservation: V2Reservation;
    /** Oltre `LATE_GRACE_MINUTES` dall'orario, rispetto a `now`. */
    late: boolean;
}

/** Un tavolo che sta in più di una tavolata APERTA, visto da una di esse. */
export interface SeatingTableConflict {
    table_id: string;
    label: string;
    /** Le ALTRE tavolate aperte sullo stesso tavolo (mai quella corrente). */
    other_seating_ids: string[];
}

export interface ServiceBoard {
    /** Tavolate `open`, dalla più vecchia alla più recente. */
    inRoom: SeatingWithState[];
    /** `confirmed` di oggi, in ordine di orario, con la bandierina del ritardo. */
    arriving: ArrivingReservation[];
    /** Tavolate `closed`, dall'ultima chiusa alla prima. */
    closed: SeatingWithState[];
    /** seating_id → conflitti. Solo fra tavolate aperte; solo chi ne ha. */
    conflicts: ReadonlyMap<string, SeatingTableConflict[]>;
}

export interface ServiceBoardInput {
    /** Le tavolate della sede (aperte + chiuse oggi), da `listSeatingsWithState`. */
    seatings: SeatingWithState[];
    /** Le prenotazioni della stessa sede, tutti gli stati. */
    reservations: V2Reservation[];
    /** "YYYY-MM-DD" locale. */
    today: string;
    now: Date;
}

/**
 * Minuti dalla mezzanotte locale di `now`. Si confronta con l'orario della
 * prenotazione, che è TIME senza fuso: stessa aritmetica "wall-clock" di
 * `isInThePast` nel drawer.
 */
function minutesOfDay(now: Date): number {
    return now.getHours() * 60 + now.getMinutes();
}

function minutesOfTime(hhmmss: string): number {
    const [hh, mm] = hhmmss.split(":").map(n => parseInt(n, 10));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.NaN;
    return hh * 60 + mm;
}

/**
 * True se la prenotazione (di oggi) è oltre la tolleranza rispetto a `now`.
 * Un orario malformato non è mai in ritardo: meglio un'attesa senza colore
 * che un allarme su un dato rotto.
 */
export function isLateArrival(
    reservation: Pick<V2Reservation, "reservation_time">,
    now: Date,
    graceMinutes: number = LATE_GRACE_MINUTES
): boolean {
    const at = minutesOfTime(reservation.reservation_time);
    if (Number.isNaN(at)) return false;
    return minutesOfDay(now) > at + graceMinutes;
}

/**
 * Chi occupa lo stesso tavolo, fra le tavolate aperte. Segnalato su ENTRAMBE
 * (o tutte), ciascuna con le altre: l'host deve vedere il problema da
 * qualunque riga stia guardando.
 *
 * Non si impedisce e non si corregge — è l'invariante del progetto: la doppia
 * occupazione si mostra. In sala succede davvero (un tavolo liberato di
 * fretta, una tavolata chiusa in ritardo) e l'unica cosa utile è che si veda.
 *
 * Solo le aperte: una tavolata chiusa non occupa più niente, e il suo tavolo
 * che oggi ospita qualcun altro è la normalità, non un conflitto.
 */
export function detectSeatingTableConflicts(
    openSeatings: SeatingWithState[]
): ReadonlyMap<string, SeatingTableConflict[]> {
    // table_id → tavolate aperte che lo occupano.
    const byTable = new Map<string, { label: string; seating_ids: string[] }>();
    for (const s of openSeatings) {
        if (s.status !== "open") continue;
        for (const t of s.tables) {
            const entry = byTable.get(t.table_id);
            if (entry) entry.seating_ids.push(s.id);
            else byTable.set(t.table_id, { label: t.label, seating_ids: [s.id] });
        }
    }

    const out = new Map<string, SeatingTableConflict[]>();
    for (const [table_id, { label, seating_ids }] of byTable) {
        if (seating_ids.length < 2) continue;
        for (const id of seating_ids) {
            const list = out.get(id) ?? [];
            list.push({
                table_id,
                label,
                other_seating_ids: seating_ids.filter(x => x !== id)
            });
            out.set(id, list);
        }
    }
    return out;
}

/**
 * I tre gruppi della schermata.
 *
 * "In arrivo" sono le `confirmed` di oggi: non le `pending` (non ancora
 * accettate: stanno in "Da gestire") e non le `seated` (già in sala: stanno
 * nel primo gruppo, dentro la loro tavolata).
 *
 * ── Lo stato della prenotazione NON basta ─────────────────────────────────
 * I due gruppi leggono due fonti che si aggiornano in tempi diversi: le
 * tavolate arrivano da `v_seatings_with_state` (canale realtime su
 * `seatings`), le prenotazioni dalla lista (canale su `reservations`). Fra un
 * evento e l'altro una prenotazione appena seduta è `open` nella tavolata e
 * ancora `confirmed` nella lista — e comparirebbe in ENTRAMBI i gruppi, con
 * tanto di "In ritardo" sotto a "appena seduta". Non è un ritardo di
 * aggiornamento, è la forma del dato, e ricaricare più spesso restringe la
 * finestra senza chiuderla.
 *
 * Quindi "in arrivo" esclude chi compare in una tavolata APERTA, leggendo le
 * tavolate e non lo stato: l'esclusione nasce dallo stesso snapshot che
 * produce "in sala", e i due gruppi non possono più smentirsi, qualunque cosa
 * faccia l'altra sottoscrizione.
 */
export function composeServiceBoard({
    seatings,
    reservations,
    today,
    now
}: ServiceBoardInput): ServiceBoard {
    const inRoom = seatings
        .filter(s => s.status === "open")
        .sort((a, b) => a.opened_at.localeCompare(b.opened_at));

    const closed = seatings
        .filter(s => s.status === "closed")
        .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

    const seatedIds = new Set<string>();
    for (const s of inRoom) for (const r of s.reservations) seatedIds.add(r.reservation_id);

    const arriving = reservations
        .filter(
            r =>
                r.status === "confirmed" &&
                r.reservation_date === today &&
                !seatedIds.has(r.id)
        )
        .sort((a, b) => a.reservation_time.localeCompare(b.reservation_time))
        .map(reservation => ({ reservation, late: isLateArrival(reservation, now) }));

    return {
        inRoom,
        arriving,
        closed,
        conflicts: detectSeatingTableConflicts(inRoom)
    };
}

/**
 * Come si chiama una tavolata quando la si nomina dentro una frase ("Tavolo 4
 * anche con …"). I nomi delle prenotazioni collegate; se non ce ne sono, è
 * un walk-in e si dice per esteso — "una tavolata senza prenotazione" — così
 * la frase regge da sola, e non con un trattino: il vuoto è un'informazione.
 */
export function seatingDisplayName(seating: SeatingWithState): string {
    const names = seating.reservations.map(r => r.customer_name);
    if (names.length === 0) return "una tavolata senza prenotazione";
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}
