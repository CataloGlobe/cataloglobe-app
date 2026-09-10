// ⚠️ SYNC — gemello SQL: `public.assign_tables_for_reservation`
// (supabase/migrations/20260907150300_assign_tables_for_reservation.sql).
//
// Il motore decide chi occupa un tavolo e quando; questo file lo rilegge lato
// client per DIRE all'operatore dove il motore, per scelta, non ha impedito
// nulla (due prenotazioni sullo stesso tavolo dopo una disdetta annullata,
// una scelta dell'operatore rimasta incoerente dopo uno spostamento). Se la
// condizione di occupazione cambia di là, va cambiata anche qui, nello stesso
// commit:
//   - stati che occupano:  status IN ('pending', 'confirmed', 'seated')
//   - finestra:            [date+time, date+time + reservation_duration_minutes)
//   - sovrapposizione:     o.start < v_end AND o.start + dur > v_start
//                          (intervalli SEMIAPERTI: 20:00-22:00 non tocca 22:00)
//   - banda di date:       o.reservation_date BETWEEN v_date - 1 AND v_date + 1
//
// Puro: nessun DOM, nessun accesso a Supabase. Non riusa la logica di
// `reservationCapacity.ts`: quella conta coperti su `pending|confirmed` per un
// altro scopo (capienza), e includere `seated` là cambierebbe quel calcolo.

import type { ReservationStatus } from "@/types/reservation";
import { timeToMinutes } from "@/utils/reservationCapacity";

/** Stati che occupano un tavolo. Dichiarati qui, non derivati: è la regola. */
export const OCCUPYING_STATUSES: ReadonlySet<ReservationStatus> = new Set<ReservationStatus>([
    "pending",
    "confirmed",
    "seated"
]);

export const DEFAULT_TABLE_DURATION_MINUTES = 120;

const MINUTES_PER_DAY = 1440;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface ReservationWindow {
    /** "YYYY-MM-DD" */
    reservation_date: string;
    /** "HH:MM" o "HH:MM:SS" */
    reservation_time: string;
}

/** Sottoinsieme di `V2Reservation` che serve al rilevamento. */
export interface ConflictReservation extends ReservationWindow {
    id: string;
    activity_id: string;
    status: ReservationStatus;
}

/** Sottoinsieme di `ReservationTableAssignmentWithTable` che serve al rilevamento. */
export interface ConflictAssignment {
    reservation_id: string;
    table_id: string;
    activity_id: string;
    table: { deleted_at: string | null } | null;
}

export type ReservationTableConflict =
    | {
          kind: "overlap";
          table_id: string;
          /** Le altre prenotazioni attive sullo stesso tavolo con finestra sovrapposta. */
          other_reservation_ids: string[];
      }
    | {
          /** Il tavolo non esiste più (soft-deleted) o non è leggibile. */
          kind: "table_deleted";
          table_id: string;
      };

function parseLocalDate(iso: string): Date | null {
    const m = ISO_DATE.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d);
}

/** Giorni interi fra due date locali (D+1 → 1, D-1 → -1). */
function diffInDays(target: Date, reference: Date): number {
    return Math.round((target.getTime() - reference.getTime()) / 86_400_000);
}

/**
 * Inizio della prenotazione in minuti sull'asse del giorno di riferimento
 * (0 = mezzanotte di `referenceDate`). NaN se fuori dalla banda D-1..D+1 o
 * se l'input è malformato — in entrambi i casi la riga non partecipa.
 */
function startMinutes(w: ReservationWindow, referenceDate: Date): number {
    const d = parseLocalDate(w.reservation_date);
    if (!d) return Number.NaN;
    const offsetDays = diffInDays(d, referenceDate);
    if (offsetDays < -1 || offsetDays > 1) return Number.NaN;
    const m = timeToMinutes(w.reservation_time);
    if (Number.isNaN(m)) return Number.NaN;
    return offsetDays * MINUTES_PER_DAY + m;
}

/**
 * True se le finestre `[start, start + durationMin)` delle due prenotazioni
 * si sovrappongono. Stessa condizione del motore SQL, vedi header.
 * La durata è quella della sede: entrambe le prenotazioni devono essere della
 * stessa sede perché il confronto abbia senso (il chiamante lo garantisce).
 */
export function reservationWindowsOverlap(
    a: ReservationWindow,
    b: ReservationWindow,
    durationMin: number
): boolean {
    if (!(durationMin > 0)) return false;
    const ref = parseLocalDate(a.reservation_date);
    if (!ref) return false;
    const aStart = startMinutes(a, ref);
    const bStart = startMinutes(b, ref);
    if (Number.isNaN(aStart) || Number.isNaN(bStart)) return false;
    const aEnd = aStart + durationMin;
    const bEnd = bStart + durationMin;
    return bStart < aEnd && bEnd > aStart;
}

/**
 * Conflitti per prenotazione. Una prenotazione con più tavoli può avere il
 * conflitto su uno solo: ogni voce della lista porta il suo `table_id`.
 *
 * - `overlap`: due o più prenotazioni che OCCUPANO (vedi `OCCUPYING_STATUSES`)
 *   lo stesso tavolo con finestre sovrapposte. Segnalato su entrambe.
 * - `table_deleted`: il tavolo assegnato è soft-deleted o non leggibile.
 *   Segnalato solo su prenotazioni che occupano: su una annullata la ponte è
 *   storico, non un problema da risolvere.
 *
 * `durationByActivity`: `activities.reservation_duration_minutes` per sede;
 * sede assente → `DEFAULT_TABLE_DURATION_MINUTES`.
 * Prenotazioni assenti da `reservations` (assegnazioni orfane nel dataset
 * passato) vengono ignorate: il rilevamento vale per ciò che l'UI mostra.
 */
export function detectReservationTableConflicts(
    reservations: ReadonlyArray<ConflictReservation>,
    assignments: ReadonlyArray<ConflictAssignment>,
    durationByActivity: ReadonlyMap<string, number>
): Map<string, ReservationTableConflict[]> {
    const out = new Map<string, ReservationTableConflict[]>();
    const push = (id: string, c: ReservationTableConflict) => {
        const list = out.get(id);
        if (list) list.push(c);
        else out.set(id, [c]);
    };

    const occupying = new Map<string, ConflictReservation>();
    for (const r of reservations) {
        if (OCCUPYING_STATUSES.has(r.status)) occupying.set(r.id, r);
    }

    // (activity, table) → prenotazioni occupanti assegnate a quel tavolo.
    const byTable = new Map<string, ConflictReservation[]>();
    for (const a of assignments) {
        const r = occupying.get(a.reservation_id);
        if (!r) continue;

        if (a.table === null || a.table.deleted_at !== null) {
            push(r.id, { kind: "table_deleted", table_id: a.table_id });
            // Un tavolo rimosso non compete con nessuno: chi ci sedeva va
            // spostato a prescindere, il doppio avviso sarebbe rumore.
            continue;
        }

        const key = `${a.activity_id} ${a.table_id}`;
        const list = byTable.get(key);
        if (list) list.push(r);
        else byTable.set(key, [r]);
    }

    for (const [key, list] of byTable) {
        if (list.length < 2) continue;
        const tableId = key.slice(key.indexOf(" ") + 1);
        const durationMin =
            durationByActivity.get(list[0].activity_id) ?? DEFAULT_TABLE_DURATION_MINUTES;

        for (const r of list) {
            const others = list
                .filter(o => o.id !== r.id && reservationWindowsOverlap(r, o, durationMin))
                .map(o => o.id)
                .sort();
            if (others.length > 0) {
                push(r.id, { kind: "overlap", table_id: tableId, other_reservation_ids: others });
            }
        }
    }

    return out;
}
