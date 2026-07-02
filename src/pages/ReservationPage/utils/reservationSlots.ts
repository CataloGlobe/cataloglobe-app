// Slot generation utilities for the public reservation date/time picker.
//
// Generation logic re-uses `availability.ts:getDaySlots` as the single
// source of truth for opening ranges + overnight tail attribution. Slots
// after midnight from a `closes_next_day=true` range are NEVER emitted on
// day D; they appear as the morning tail on day D+1 (where
// `getDaySlots(D+1)` already prepends them with `opens_at="00:00"`). This
// guarantees parity with the server, which stores reservations as separate
// (date, time) columns and treats `00:30` as the wall-clock date.

import { addDays, todayIsoDate } from "@/utils/dateLocal";
import {
    getDaySlots,
    parseLocalDate,
    type OpeningHoursEntry,
    type UpcomingClosure
} from "@pages/ReservationPage/availability";

export const RESERVATION_HORIZON_DAYS = 90;

const SLOT_STEP_MIN = 15;
const HHMM_RE = /^\d{2}:\d{2}/;

export type ReservationSlotState = "available" | "past" | "soldout";

export type ReservationSlot = {
    /** "HH:MM" wall-clock time. */
    time: string;
    /** "YYYY-MM-DD" wall-clock date the slot belongs to. Always equal to
     *  the calling date for slots produced by `getReservationPeriodsForDate`. */
    date: string;
    state: ReservationSlotState;
};

export type ReservationPeriodKey =
    | "notte"
    | "mattina"
    | "pranzo"
    | "pomeriggio"
    | "sera";

export type ReservationPeriodGroup = {
    key: ReservationPeriodKey;
    /** Label italiana della fascia. Usata dall'admin (scope IT-only). La
     *  pagina pubblica NON la legge: risolve la label localizzata a render nel
     *  TimePicker via `t(reservation.period_*)` mappando su `key`. */
    label: string;
    slots: ReservationSlot[];
};

export type ReservationDayCell = {
    /** "YYYY-MM-DD". */
    iso: string;
    /** Day-of-month number (1..31). */
    dayNum: number;
    /** Localized short weekday label (e.g. "lun"). */
    weekdayShort: string;
    isToday: boolean;
    /** Disabled iff `getDaySlots(iso).length === 0`. Single source of
     *  truth for weekly closures, full-day closures and partial-closure
     *  emptiness. */
    disabled: boolean;
};

// ── Time helpers ────────────────────────────────────────────────────────────

function timeToMin(t: string): number {
    if (!HHMM_RE.test(t)) return -1;
    const hh = Number(t.slice(0, 2));
    const mm = Number(t.slice(3, 5));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return -1;
    return hh * 60 + mm;
}

function minToHHMM(min: number): string {
    const clamped = ((min % 1440) + 1440) % 1440;
    const h = Math.floor(clamped / 60);
    const m = clamped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toIsoLocal(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

// ── Slot generation (per opening range) ─────────────────────────────────────

type RawSlot = ReservationSlot;

/**
 * Emits the flat list of 15-minute slots for a given date, honoring the
 * overnight rule:
 *   - `closes_next_day === false` → iterate `[opens_at, closes_at)`.
 *   - `closes_next_day === true`  → iterate `[opens_at, "24:00")` (up to
 *     and including 23:45). The portion after midnight is intentionally
 *     NOT emitted here — it appears as the morning tail on day D+1.
 *
 * `state`:
 *   - `"past"` when the date is today AND the slot time has already passed
 *     relative to `now` (slot's start minute `<=` now's minute).
 *   - `"available"` otherwise.
 *   - `"soldout"` is never produced (reserved for a future per-slot
 *     capacity API; left in the type union so renderers stay ready).
 */
function generateDaySlots(
    isoDate: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[],
    now: Date
): RawSlot[] {
    const ranges = getDaySlots(isoDate, hours, closures);
    if (ranges.length === 0) return [];

    const nowIso = toIsoLocal(now);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const isToday = isoDate === nowIso;

    const out: RawSlot[] = [];
    for (const range of ranges) {
        const startMin = timeToMin(range.opens_at);
        const closeMin = timeToMin(range.closes_at);
        if (startMin < 0 || closeMin < 0) continue;

        const endMinExclusive = range.closes_next_day ? 24 * 60 : closeMin;
        if (endMinExclusive <= startMin) continue;

        for (let m = startMin; m < endMinExclusive; m += SLOT_STEP_MIN) {
            const time = minToHHMM(m);
            const state: ReservationSlotState =
                isToday && m <= nowMin ? "past" : "available";
            out.push({ time, date: isoDate, state });
        }
    }
    return out;
}

// ── Period (time-of-day band) classification ────────────────────────────────

// La `label` IT serve all'admin (IT-only); la pagina pubblica la ignora e
// localizza a render via `key`. Vedi ReservationTimePicker (PERIOD_I18N).
const PERIOD_ORDER: { key: ReservationPeriodKey; label: string }[] = [
    { key: "notte", label: "Notte" },
    { key: "mattina", label: "Mattina" },
    { key: "pranzo", label: "Pranzo" },
    { key: "pomeriggio", label: "Pomeriggio" },
    { key: "sera", label: "Sera" }
];

/**
 * Classifies a slot into a period by start hour:
 *   - Notte       0–5
 *   - Mattina     6–11
 *   - Pranzo      12–14
 *   - Pomeriggio  15–17
 *   - Sera        18–23
 */
export function classifyPeriod(time: string): ReservationPeriodKey | null {
    const min = timeToMin(time);
    if (min < 0) return null;
    const hour = Math.floor(min / 60);
    if (hour >= 0 && hour < 6) return "notte";
    if (hour >= 6 && hour < 12) return "mattina";
    if (hour >= 12 && hour < 15) return "pranzo";
    if (hour >= 15 && hour < 18) return "pomeriggio";
    if (hour >= 18 && hour < 24) return "sera";
    return null;
}

/**
 * Returns the day's slots regrouped by time-of-day period. The underlying
 * generation rule (overnight, 15-minute step, past/available state) is
 * unchanged — this only flattens `getDaySlots`'s opening ranges and re-buckets
 * the result by period. Empty periods are omitted; ordering follows
 * `PERIOD_ORDER`.
 */
export function getReservationPeriodsForDate(
    isoDate: string,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[],
    now: Date
): ReservationPeriodGroup[] {
    const flat = generateDaySlots(isoDate, hours, closures, now);
    if (flat.length === 0) return [];

    const buckets: Record<ReservationPeriodKey, ReservationSlot[]> = {
        notte: [],
        mattina: [],
        pranzo: [],
        pomeriggio: [],
        sera: []
    };

    for (const slot of flat) {
        const key = classifyPeriod(slot.time);
        if (!key) continue;
        buckets[key].push(slot);
    }

    const out: ReservationPeriodGroup[] = [];
    for (const p of PERIOD_ORDER) {
        const slots = buckets[p.key];
        if (slots.length === 0) continue;
        out.push({ key: p.key, label: p.label, slots });
    }
    return out;
}

/**
 * Default period index for the segmented selector. Picks the period
 * containing `now` ONLY when the slots belong to today AND that period
 * has at least one `"available"` slot; otherwise returns 0.
 */
export function findDefaultPeriodIndex(
    periods: ReservationPeriodGroup[],
    now: Date
): number {
    if (periods.length === 0) return 0;
    const first = periods[0]?.slots[0];
    if (!first) return 0;
    const nowIso = toIsoLocal(now);
    if (first.date !== nowIso) return 0;
    const nowKey = classifyPeriod(
        `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    );
    if (!nowKey) return 0;
    const idx = periods.findIndex(
        p => p.key === nowKey && p.slots.some(s => s.state === "available")
    );
    return idx >= 0 ? idx : 0;
}

// ── Day list generation ─────────────────────────────────────────────────────

/**
 * Builds the list of selectable days from today to today + `horizonDays - 1`
 * (90-day horizon by default).
 *
 * `disabled` uses `getDaySlots(iso).length === 0` as the single criterion —
 * covers both weekly closures and full-day `activity_closures` entries
 * without re-implementing either.
 */
export function buildHorizonDays(
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[],
    horizonDays = RESERVATION_HORIZON_DAYS,
    today = todayIsoDate(),
    weekdayShort: (date: Date) => string = defaultWeekdayShort
): ReservationDayCell[] {
    const start = parseLocalDate(today);
    if (!start) return [];

    const cells: ReservationDayCell[] = [];
    for (let i = 0; i < horizonDays; i++) {
        const d = addDays(start, i);
        const iso = toIsoLocal(d);
        const disabled = getDaySlots(iso, hours, closures).length === 0;
        cells.push({
            iso,
            dayNum: d.getDate(),
            weekdayShort: weekdayShort(d),
            isToday: i === 0,
            disabled
        });
    }
    return cells;
}

/**
 * Subset of `buildHorizonDays` filtered to a given (year, month). Days
 * outside the [today, today + horizonDays - 1] range are excluded.
 */
export function buildMonthDays(
    year: number,
    month: number,
    hours: OpeningHoursEntry[],
    closures: UpcomingClosure[],
    horizonDays = RESERVATION_HORIZON_DAYS,
    today = todayIsoDate(),
    weekdayShort: (date: Date) => string = defaultWeekdayShort
): ReservationDayCell[] {
    const all = buildHorizonDays(hours, closures, horizonDays, today, weekdayShort);
    return all.filter(c => {
        const d = parseLocalDate(c.iso);
        if (!d) return false;
        return d.getFullYear() === year && d.getMonth() === month;
    });
}

// Default short weekday formatter, italian locale. Caller can override to
// inject a memoized `Intl.DateTimeFormat` instance.
function defaultWeekdayShort(date: Date): string {
    return new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(date);
}

// ── Calendar nav helpers ────────────────────────────────────────────────────

export type CalendarMonthView = { year: number; month: number };

/** Month containing the given ISO date, or today's month if missing/invalid. */
export function monthOfIso(iso: string | null | undefined): CalendarMonthView {
    if (iso) {
        const d = parseLocalDate(iso);
        if (d) return { year: d.getFullYear(), month: d.getMonth() };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
}

export function shiftMonth(view: CalendarMonthView, delta: number): CalendarMonthView {
    // Build via local Date so year rollover (Dec ↔ Jan) is handled by the
    // platform without manual modulo arithmetic.
    const d = new Date(view.year, view.month + delta, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
}

/** Inclusive comparison: (a.year, a.month) <=> (b.year, b.month) → -1/0/1. */
export function compareMonth(a: CalendarMonthView, b: CalendarMonthView): number {
    if (a.year !== b.year) return a.year < b.year ? -1 : 1;
    if (a.month !== b.month) return a.month < b.month ? -1 : 1;
    return 0;
}

export function monthOfHorizonEnd(
    today: string,
    horizonDays = RESERVATION_HORIZON_DAYS
): CalendarMonthView {
    const start = parseLocalDate(today);
    if (!start) return monthOfIso(today);
    const last = addDays(start, horizonDays - 1);
    return { year: last.getFullYear(), month: last.getMonth() };
}
