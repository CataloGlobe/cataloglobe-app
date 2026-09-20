// FASE 5.5 — «bloccare una fascia oraria».
//
// L'operatore sceglie una data e una fascia in cui la sede NON è aperta;
// qui si calcola cosa resta aperto quel giorno, nella forma che
// `activity_closures` sa già esprimere: una riga `is_closed=false` con
// `slots` = le fasce superstiti (o `is_closed=true` se non ne resta
// nessuna). Nessuno schema nuovo: il picker pubblico e il cancello di
// `submit-reservation` leggono già quella riga (decisione 1 della fase).
//
// Il punto di partenza — cosa è aperto in quella data — NON si ricalcola
// qui: lo dà `getDaySlots` di `availability.ts`, la stessa funzione che
// alimenta il picker. Se il picker e questo calcolo divergessero, il
// blocco toglierebbe orari diversi da quelli offerti; usando la stessa
// funzione la divergenza non può nascere.
//
// Vincolo di rappresentazione (decisione 3): una fascia di `slots` va da un
// orario del giorno D a un orario di D o del giorno dopo. Il pezzo che
// resterebbe DOPO la mezzanotte quando la fascia bloccata arriva fino a
// mezzanotte (es. aperto 19:00–02:00+1, bloccato 22:00–24:00 → resta
// 00:00–02:00 di D+1) non ha una forma in `slots` di D: in quel caso si
// rifiuta, non si inventa.

import type { ClosureSlot, V2ActivityClosure } from "@/types/activity-closures";
import type { V2ActivityHours } from "@/types/activity-hours";
import { getDaySlots } from "@/pages/ReservationPage/availability";

export const END_OF_DAY = 24 * 60;

export type BlockTimeRangeResult =
    /** La data è già coperta da una chiusura: si modifica quella, non se ne crea una seconda. */
    | { kind: "already-closure" }
    /** Quel giorno la sede non è aperta: non c'è niente da bloccare. */
    | { kind: "no-hours" }
    /** La fascia non tocca nessun orario di apertura: il giorno resterebbe identico. */
    | { kind: "no-overlap"; before: ClosureSlot[] }
    /** Resterebbe aperto solo un pezzo dopo la mezzanotte: non esprimibile in `slots`. */
    | { kind: "not-representable"; before: ClosureSlot[] }
    /** La fascia copre tutto ciò che era aperto: il giorno diventa chiuso. */
    | { kind: "closed-all-day"; before: ClosureSlot[] }
    /** Ciò che resta aperto, nell'ordine del giorno. */
    | { kind: "partial"; before: ClosureSlot[]; slots: ClosureSlot[] };

export interface BlockTimeRangeInput {
    isoDate: string;
    hours: V2ActivityHours[];
    closures: V2ActivityClosure[];
    /** "HH:MM", inizio della fascia bloccata (incluso). */
    from: string;
    /** "HH:MM", fine della fascia bloccata (esclusa); "00:00" vale mezzanotte di fine giornata. */
    to: string;
}

function toMinutes(t: string): number {
    const [h, m] = t.split(":");
    return Number(h) * 60 + Number(m);
}

function toHHMM(minutes: number): string {
    const m = ((minutes % END_OF_DAY) + END_OF_DAY) % END_OF_DAY;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** La fine della fascia bloccata in minuti del giorno: "00:00" è la mezzanotte che chiude il giorno. */
export function blockEndMinutes(to: string): number {
    const m = toMinutes(to);
    return m === 0 ? END_OF_DAY : m;
}

/** Fascia in minuti dal 00:00 di D; `closes` può superare 1440 (giorno dopo). */
interface Range {
    opens: number;
    closes: number;
}

function rangeOf(s: ClosureSlot): Range {
    const opens = toMinutes(s.opens_at);
    const closesRaw = toMinutes(s.closes_at);
    return { opens, closes: s.closes_next_day ? closesRaw + END_OF_DAY : closesRaw };
}

function slotOf(r: Range): ClosureSlot {
    return {
        opens_at: toHHMM(r.opens),
        closes_at: toHHMM(r.closes),
        closes_next_day: r.closes >= END_OF_DAY
    };
}

/** Gli orari della tabella arrivano come "HH:MM:SS"; `slots` vuole "HH:MM". */
function normalizeHours(hours: V2ActivityHours[]) {
    return hours.map(h => ({
        day_of_week: h.day_of_week,
        slot_index: h.slot_index,
        opens_at: h.opens_at ? h.opens_at.slice(0, 5) : null,
        closes_at: h.closes_at ? h.closes_at.slice(0, 5) : null,
        is_closed: h.is_closed,
        closes_next_day: h.closes_next_day
    }));
}

function coversDate(c: V2ActivityClosure, isoDate: string): boolean {
    const end = c.end_date ?? c.closure_date;
    return c.closure_date <= isoDate && isoDate <= end;
}

/**
 * Sottrae `[from, to)` da ogni fascia aperta della data. Le fasce che si
 * svuotano spariscono; se spariscono tutte il giorno diventa chiuso.
 */
export function computeBlockedDay(input: BlockTimeRangeInput): BlockTimeRangeResult {
    const { isoDate, hours, closures, from, to } = input;

    if (closures.some(c => coversDate(c, isoDate))) return { kind: "already-closure" };

    const before: ClosureSlot[] = getDaySlots(isoDate, normalizeHours(hours), closures).map(s => ({
        opens_at: s.opens_at,
        closes_at: s.closes_at,
        closes_next_day: s.closes_next_day
    }));
    if (before.length === 0) return { kind: "no-hours" };

    const a = toMinutes(from);
    const b = blockEndMinutes(to);

    const remaining: Range[] = [];
    let touched = false;
    for (const slot of before) {
        const r = rangeOf(slot);
        const overlaps = a < r.closes && b > r.opens;
        if (!overlaps) {
            remaining.push(r);
            continue;
        }
        touched = true;
        if (a > r.opens) remaining.push({ opens: r.opens, closes: a });
        if (b < r.closes) {
            // Il pezzo che resta apre a `b`: se `b` è la mezzanotte, apre nel
            // giorno dopo e `slots` di D non lo sa dire.
            if (b >= END_OF_DAY) return { kind: "not-representable", before };
            remaining.push({ opens: b, closes: r.closes });
        }
    }

    if (!touched) return { kind: "no-overlap", before };
    if (remaining.length === 0) return { kind: "closed-all-day", before };
    return { kind: "partial", before, slots: remaining.map(slotOf) };
}

/** "07:30–20:00, 22:00–22:30" — per l'anteprima nel form. */
export function formatSlotList(slots: ClosureSlot[]): string {
    return slots
        .map(s => `${s.opens_at}–${s.closes_at}${s.closes_next_day ? " (+1)" : ""}`)
        .join(", ");
}
