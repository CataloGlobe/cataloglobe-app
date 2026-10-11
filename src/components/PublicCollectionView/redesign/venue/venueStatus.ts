import type { OpeningHoursEntry, UpcomingClosure } from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

/**
 * Stato del locale per l'isola: «Aperto», «Chiude tra N min», «Chiuso · apre alle…».
 * Puro, senza DOM: l'istante entra come argomento, il fuso è quello di Roma.
 *
 * Regole come quelle degli orari delle prenotazioni (`ReservationPage/availability.ts`):
 * fasce del giorno, coda notturna del giorno prima, chiusura straordinaria che
 * sostituisce le fasce del suo giorno e sopprime la coda notturna del giorno prima.
 * Differenza voluta: senza nessuna fascia l'isola non dice niente (`unknown`),
 * mentre gli ordini al tavolo trattano la sede senza orari come aperta.
 */

/** Sotto questi minuti dalla chiusura l'isola dice «Chiude tra N min». */
export const CLOSING_SOON_MINUTES = 60;
/** Quanti giorni avanti cercare la prossima apertura. */
const LOOKAHEAD_DAYS = 7;
const MINUTES_PER_DAY = 1440;

export type VenueStatus =
    | { kind: "unknown" }
    | { kind: "open" }
    | { kind: "closing-soon"; minutes: number }
    | { kind: "closed"; opensAt: { dayOffset: number; time: string; dow: number } | null };

type Interval = { start: number; end: number };

type RomeNow = { isoDate: string; dow: number; minutes: number };

const SHORT_TO_MON: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

const romeFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short"
});

function romeNow(instant: Date): RomeNow {
    const p = Object.fromEntries(romeFormat.formatToParts(instant).map(x => [x.type, x.value]));
    // Alcuni ICU rendono la mezzanotte come «24».
    const hour = Number(p.hour) === 24 ? 0 : Number(p.hour);
    return {
        isoDate: `${p.year}-${p.month}-${p.day}`,
        dow: SHORT_TO_MON[p.weekday as string],
        minutes: hour * 60 + Number(p.minute)
    };
}

function addDays(isoDate: string, days: number): string {
    const [y, m, d] = isoDate.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function toMinutes(time: string): number {
    const [h, m] = time.split(":");
    return Number(h) * 60 + Number(m);
}

function formatTime(minutes: number): string {
    const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function closureCovering(isoDate: string, closures: UpcomingClosure[]): UpcomingClosure | null {
    for (const c of closures) {
        const end = c.end_date ?? c.closure_date;
        if (c.closure_date <= isoDate && isoDate <= end) return c;
    }
    return null;
}

/** Fasce effettive di un giorno, in minuti dalla sua mezzanotte (la chiusura può superare 1440). */
function daySlots(isoDate: string, dow: number, hours: OpeningHoursEntry[], closures: UpcomingClosure[]): Interval[] {
    const raw: { opens: string; closes: string; nextDay: boolean | undefined }[] = [];
    const closure = closureCovering(isoDate, closures);
    if (closure) {
        if (closure.is_closed) return [];
        for (const s of closure.slots ?? []) {
            raw.push({ opens: s.opens_at, closes: s.closes_at, nextDay: s.closes_next_day });
        }
    } else {
        for (const h of hours) {
            if (h.day_of_week === dow && !h.is_closed && h.opens_at && h.closes_at) {
                raw.push({ opens: h.opens_at, closes: h.closes_at, nextDay: h.closes_next_day });
            }
        }
    }
    return raw.map(s => {
        const start = toMinutes(s.opens);
        let end = toMinutes(s.closes);
        if (s.nextDay || end <= start) end += MINUTES_PER_DAY;
        return { start, end };
    });
}

/** Un solo passaggio: unisce le fasce che si toccano (es. chiude a mezzanotte, riapre a mezzanotte). */
function merge(intervals: Interval[]): Interval[] {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const out: Interval[] = [];
    for (const i of sorted) {
        const last = out[out.length - 1];
        if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
        else out.push({ ...i });
    }
    return out;
}

/**
 * Fasce di oggi (a Roma) per la riga «Oggi» del fondo: «12:00–15:00». La
 * chiusura straordinaria di oggi sostituisce le fasce. [] = oggi chiuso,
 * null = la sede non ha orari.
 */
export function todayOpeningRanges(
    now: Date,
    hours: OpeningHoursEntry[] | undefined,
    closures: UpcomingClosure[] | undefined
): string[] | null {
    if (!hours || hours.length === 0) return null;
    const today = romeNow(now);
    return merge(daySlots(today.isoDate, today.dow, hours, closures ?? [])).map(
        i => `${formatTime(i.start)}–${formatTime(i.end)}`
    );
}

export function computeVenueStatus(
    now: Date,
    hours: OpeningHoursEntry[] | undefined,
    closures: UpcomingClosure[] | undefined
): VenueStatus {
    if (!hours || hours.length === 0) return { kind: "unknown" };
    const closureList = closures ?? [];
    const today = romeNow(now);

    // Intervalli in minuti dalla mezzanotte di oggi: ieri (coda notturna) .. oggi + 7 giorni.
    const intervals: Interval[] = [];
    for (let k = -1; k <= LOOKAHEAD_DAYS; k++) {
        const isoDate = addDays(today.isoDate, k);
        const dow = (((today.dow + k) % 7) + 7) % 7;
        const nextDayClosed = closureCovering(addDays(isoDate, 1), closureList) !== null;
        for (const s of daySlots(isoDate, dow, hours, closureList)) {
            // La chiusura straordinaria del giorno dopo toglie la coda notturna.
            const end = nextDayClosed ? Math.min(s.end, MINUTES_PER_DAY) : s.end;
            if (end > s.start) intervals.push({ start: k * MINUTES_PER_DAY + s.start, end: k * MINUTES_PER_DAY + end });
        }
    }

    const merged = merge(intervals);
    const n = today.minutes;

    const current = merged.find(i => i.start <= n && n < i.end);
    if (current) {
        const remaining = current.end - n;
        return remaining <= CLOSING_SOON_MINUTES ? { kind: "closing-soon", minutes: remaining } : { kind: "open" };
    }

    const next = merged.find(i => i.start > n);
    if (!next) return { kind: "closed", opensAt: null };
    const dayOffset = Math.floor(next.start / MINUTES_PER_DAY);
    return {
        kind: "closed",
        // dow: giorno della settimana dell'apertura, lunedì = 0 (serve a nominarlo oltre domani).
        opensAt: { dayOffset, time: formatTime(next.start), dow: (((today.dow + dayOffset) % 7) + 7) % 7 }
    };
}
