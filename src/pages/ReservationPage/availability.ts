import { addDays } from "@/utils/dateLocal";
import type {
    OpeningHoursEntry,
    UpcomingClosure
} from "@components/PublicCollectionView/PublicOpeningHours/PublicOpeningHours";

// Local utility for the public reservation form. Validates the customer's
// chosen date+time against the activity's configured opening hours and
// upcoming closures. Re-exports the types from PublicOpeningHours to keep a
// single source of truth.
export type { OpeningHoursEntry, UpcomingClosure };

export type Slot = {
    opens_at: string; // "HH:MM"
    closes_at: string; // "HH:MM"
    closes_next_day: boolean;
};

// ── Date / time helpers ─────────────────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^\d{2}:\d{2}/;

// Parse "YYYY-MM-DD" → Date built with LOCAL constructor (avoids the UTC
// drift you get from `new Date("YYYY-MM-DD")` in timezones west of UTC).
// Reservations are wall-clock-local by definition.
export function parseLocalDate(iso: string): Date | null {
    if (!ISO_DATE_RE.test(iso)) return null;
    const y = Number(iso.slice(0, 4));
    const mo = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d);
}

// Monday-based weekday index matching activity_hours.day_of_week (0=Mon..6=Sun).
// JS getDay() returns 0=Sun..6=Sat; mondayIndex = (getDay() + 6) % 7.
export function mondayWeekday(date: Date): number {
    return (date.getDay() + 6) % 7;
}

function toIsoLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function timeToMin(t: string): number {
    if (!HHMM_RE.test(t)) return -1;
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(3, 5));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 60 + mm;
}

// ── Closure lookup ──────────────────────────────────────────────────────────

// Closure_date..end_date is inclusive on both ends (per activity_closures schema).
// String comparison works because ISO dates sort lexicographically.
export function findClosureCovering(
    isoDate: string,
    closures: UpcomingClosure[]
): UpcomingClosure | null {
    for (const c of closures) {
        const start = c.closure_date;
        const end = c.end_date ?? c.closure_date;
        if (isoDate >= start && isoDate <= end) return c;
    }
    return null;
}

// ── Slot resolution ─────────────────────────────────────────────────────────

function weekdaySlots(date: Date, hours: OpeningHoursEntry[]): Slot[] {
    const w = mondayWeekday(date);
    return hours
        .filter(h => h.day_of_week === w && !h.is_closed && h.opens_at && h.closes_at)
        .map(h => ({
            opens_at: h.opens_at as string,
            closes_at: h.closes_at as string,
            // Defensive: closes_next_day is optional on the shared type.
            closes_next_day: Boolean(h.closes_next_day)
        }));
}

function closurePartialSlots(c: UpcomingClosure): Slot[] {
    if (c.is_closed) return [];
    return (c.slots ?? []).map(s => ({
        opens_at: s.opens_at,
        closes_at: s.closes_at,
        closes_next_day: s.closes_next_day
    }));
}

// Returns the open slots for a given date.
// Priority:
//   1. If a closure covers the date → REPLACES weekday hours.
//      - is_closed=true ⇒ no slots, no overnight tail allowed either.
//      - is_closed=false ⇒ closure.slots (override).
//   2. Otherwise → weekday hours from activity_hours.
// Always prepends the overnight tail from the previous day's slot when
// closes_next_day=true, unless the previous day is itself a full closure.
// Partial closure on previous day uses its slots as source for the tail.
export function getDaySlots(
    isoDate: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[]
): Slot[] {
    const date = parseLocalDate(isoDate);
    if (!date) return [];

    const closure = findClosureCovering(isoDate, closures);
    if (closure) {
        // Closure (full or partial) REPLACES weekday hours AND suppresses
        // overnight tail from previous day — the customer marked the day as
        // special, so the previous day's overflow doesn't apply.
        return closurePartialSlots(closure);
    }
    const main = weekdaySlots(date, hours);

    // Overnight tail from previous date (only if not fully closed there).
    const prevDate = addDays(date, -1);
    const prevIso = toIsoLocal(prevDate);
    const prevClosure = findClosureCovering(prevIso, closures);
    let prevSlots: Slot[];
    if (prevClosure) {
        prevSlots = closurePartialSlots(prevClosure);
    } else {
        prevSlots = weekdaySlots(prevDate, hours);
    }

    const tails: Slot[] = prevSlots
        .filter(s => s.closes_next_day && timeToMin(s.closes_at) > 0)
        .map(s => ({
            opens_at: "00:00",
            closes_at: s.closes_at,
            // Tail itself does NOT overflow further.
            closes_next_day: false
        }));

    return [...tails, ...main];
}

// ── Public predicates ───────────────────────────────────────────────────────

export function isDateFullyClosedByClosure(
    isoDate: string,
    closures: UpcomingClosure[]
): UpcomingClosure | null {
    const c = findClosureCovering(isoDate, closures);
    return c && c.is_closed ? c : null;
}

// True iff:
//   - No closure covers the date AND
//   - The weekday has no slot with valid opens_at/closes_at.
// (If a closure covers the date, this returns false — closure logic takes over.)
export function isWeekdayFullyClosed(
    isoDate: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[]
): boolean {
    if (findClosureCovering(isoDate, closures)) return false;
    const date = parseLocalDate(isoDate);
    if (!date) return false;
    return weekdaySlots(date, hours).length === 0;
}

// True iff the given "HH:MM" falls within ANY of the day's slots.
// For slots with closes_next_day=true, the upper bound on the CURRENT date is
// 24:00 (the slot extends past midnight); the early-morning portion is
// already prepended as a separate "00:00–closes_at" tail by getDaySlots, so
// the standard range check on it is correct.
export function isTimeWithinSlots(time: string, slots: Slot[]): boolean {
    const t = timeToMin(time);
    if (t < 0) return false;
    for (const s of slots) {
        const o = timeToMin(s.opens_at);
        const c = timeToMin(s.closes_at);
        if (o < 0 || c < 0) continue;
        if (s.closes_next_day) {
            if (t >= o) return true; // no upper bound today
        } else {
            if (t >= o && t <= c) return true;
        }
    }
    return false;
}

// "Aperto 12:00–15:00, 19:00–23:00". Empty string when no slots.
export function formatSlotsLabel(slots: Slot[]): string {
    if (slots.length === 0) return "";
    const parts = slots.map(s => {
        const o = s.opens_at.slice(0, 5);
        const c = s.closes_at.slice(0, 5);
        return `${o}–${c}`;
    });
    return `Aperto ${parts.join(", ")}`;
}

// ── High-level validator used by ReservationForm ────────────────────────────

export type AvailabilityErrors = {
    dateError: string | null;
    timeError: string | null;
};

// Returns soft validation errors (Italian copy) for the public reservation
// form. Returns nulls when the activity has no configured hours
// (`hours.length === 0`) — the form falls back to free-form behavior.
export function availabilityErrors(
    date: string,
    time: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[]
): AvailabilityErrors {
    if (hours.length === 0) return { dateError: null, timeError: null };
    if (!ISO_DATE_RE.test(date)) return { dateError: null, timeError: null };

    const closure = isDateFullyClosedByClosure(date, closures);
    if (closure) {
        const label = closure.label?.trim();
        const suffix = label ? ` (${label})` : "";
        return {
            dateError: `Il locale è chiuso in questa data${suffix}.`,
            timeError: null
        };
    }
    if (isWeekdayFullyClosed(date, hours, closures)) {
        return {
            dateError: "Il locale è chiuso il giorno selezionato.",
            timeError: null
        };
    }
    if (!HHMM_RE.test(time)) return { dateError: null, timeError: null };
    const slots = getDaySlots(date, hours, closures);
    if (!isTimeWithinSlots(time, slots)) {
        return {
            dateError: null,
            timeError: "L'orario selezionato è fuori dagli orari di apertura."
        };
    }
    return { dateError: null, timeError: null };
}

// "Aperto …" sub-message under the date/time row.
// Returns "" when no hours configured, date missing/invalid, day fully closed
// (the dateError message already covers that case), or no slots resolved.
export function slotsLabelForDate(
    date: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[]
): string {
    if (hours.length === 0) return "";
    if (!ISO_DATE_RE.test(date)) return "";
    if (isDateFullyClosedByClosure(date, closures)) return "";
    if (isWeekdayFullyClosed(date, hours, closures)) return "";
    const slots = getDaySlots(date, hours, closures);
    return formatSlotsLabel(slots);
}
