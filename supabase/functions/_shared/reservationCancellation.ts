// Per-venue time window for customer-driven cancellation. Pure functions: no
// I/O, no Deno API, no clock of their own — `now` is always injected, so the
// DST cases below are testable instead of hopeful.
//
// The rule: a diner may cancel from the signed email link until
// `activities.reservation_cancellation_cutoff_minutes` before the booked time.
// Past it the link stops cancelling and shows the venue's phone number: a
// last-minute no-show is a floor problem, and the answer is a phone call, not
// a form.
//
// ── 0 means NO limit ────────────────────────────────────────────────────────
// A cutoff of 0 means "cancellable at any time", NOT "never cancellable". The
// branch is explicit and comes before any arithmetic, precisely because the
// inverted reading is the one that would slip through review and quietly lock
// every diner out. Covered by a dedicated test.
//
// ── Timezone ───────────────────────────────────────────────────────────────
// `reservations.reservation_date` (date) and `reservation_time` (time) are
// wall-clock values in the venue's local time, which today is always
// Europe/Rome — same assumption as `get_operative_day_start()` and
// `openingHours.ts`. Converting them to an instant needs the tz database, not
// a fixed offset: an hour of error twice a year is exactly an hour of error at
// the boundary that matters.
// TODO multi-region: read the zone from `activities.iana_timezone` when
// non-IT tenants arrive.

export const RESERVATION_TIMEZONE = "Europe/Rome";

/** Mirror of the column default in the migration. */
export const DEFAULT_CANCELLATION_CUTOFF_MINUTES = 120;

/** Mirror of the CHECK upper bound (7 days). */
export const MAX_CANCELLATION_CUTOFF_MINUTES = 10080;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Offset of `timeZone` at a given instant, in milliseconds.
 * Derived through Intl (tz database), so DST is handled by the platform.
 */
function timeZoneOffsetMs(instantMs: number, timeZone: string): number {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        })
            .formatToParts(new Date(instantMs))
            .map(p => [p.type, p.value])
    ) as Record<string, string>;

    // Some ICU builds render midnight as "24" with hour12:false.
    const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
    const asUtc = Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        hour,
        Number(parts.minute),
        Number(parts.second)
    );
    return asUtc - instantMs;
}

/**
 * Converts a local wall-clock date+time into an absolute instant.
 *
 * Returns null on anything that is not a real date or time — callers treat
 * that as "not cancellable", never as "cancellable".
 *
 * @param isoDate `YYYY-MM-DD`
 * @param time `HH:MM` or `HH:MM:SS` (Postgres `time` renders the seconds)
 */
export function wallClockToInstant(
    isoDate: unknown,
    time: unknown,
    timeZone: string = RESERVATION_TIMEZONE
): Date | null {
    if (typeof isoDate !== "string" || typeof time !== "string") return null;

    const dateMatch = ISO_DATE_RE.exec(isoDate.trim());
    const timeMatch = TIME_RE.exec(time.trim());
    if (!dateMatch || !timeMatch) return null;

    const [, y, mo, d] = dateMatch;
    const [, hh, mi, ss] = timeMatch;
    const year = Number(y);
    const month = Number(mo);
    const day = Number(d);
    const hours = Number(hh);
    const minutes = Number(mi);
    const seconds = ss === undefined ? 0 : Number(ss);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;

    const naive = Date.UTC(year, month - 1, day, hours, minutes, seconds);
    // Reject overflow dates (2026-02-30 would silently roll into March).
    const roundTrip = new Date(naive);
    if (
        roundTrip.getUTCFullYear() !== year ||
        roundTrip.getUTCMonth() !== month - 1 ||
        roundTrip.getUTCDate() !== day
    ) {
        return null;
    }

    // Two passes: the first offset is read at the wrong instant when the
    // wall-clock time sits near a DST change; re-reading it at the corrected
    // instant settles it.
    const first = naive - timeZoneOffsetMs(naive, timeZone);
    const second = naive - timeZoneOffsetMs(first, timeZone);
    return new Date(second);
}

/**
 * Coerces the column value into a usable cutoff.
 *
 * Anything absent, non-numeric or out of the CHECK range falls back to the
 * default rather than to "no limit": a broken value must not silently disable
 * the guard.
 */
export function normalizeCutoffMinutes(raw: unknown): number {
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
        return DEFAULT_CANCELLATION_CUTOFF_MINUTES;
    }
    const value = Math.trunc(raw);
    if (value < 0 || value > MAX_CANCELLATION_CUTOFF_MINUTES) {
        return DEFAULT_CANCELLATION_CUTOFF_MINUTES;
    }
    return value;
}

export type CancellationWindowReason =
    /** Inside the window: the customer may cancel. */
    | "ok"
    /** Past the cutoff: show the venue's phone instead. */
    | "cutoff_passed"
    /** Date/time unusable: fail closed. */
    | "invalid_datetime";

export interface CancellationWindow {
    allowed: boolean;
    reason: CancellationWindowReason;
    /** Minutes between `now` and the booked time; negative once it has passed. Null when unusable. */
    minutesUntilReservation: number | null;
    /** Cutoff actually applied, after normalisation. */
    cutoffMinutes: number;
}

export interface EvaluateCancellationWindowInput {
    reservationDate: unknown;
    reservationTime: unknown;
    /** Raw `activities.reservation_cancellation_cutoff_minutes`. */
    cutoffMinutes: unknown;
    now: Date;
    timeZone?: string;
}

/**
 * Decides whether the customer is still inside the cancellation window.
 *
 * This is the server-side check. The page runs the same logic to render the
 * right state, but that is a courtesy: the endpoint re-evaluates it before
 * every write.
 */
export function evaluateCancellationWindow({
    reservationDate,
    reservationTime,
    cutoffMinutes,
    now,
    timeZone = RESERVATION_TIMEZONE
}: EvaluateCancellationWindowInput): CancellationWindow {
    const cutoff = normalizeCutoffMinutes(cutoffMinutes);
    const instant = wallClockToInstant(reservationDate, reservationTime, timeZone);
    const minutesUntil =
        instant === null ? null : Math.floor((instant.getTime() - now.getTime()) / 60000);

    // 0 = no limit: always allowed, whatever the clock says. Checked FIRST so
    // the "always allowed" reading cannot be flipped by a parsing detail.
    if (cutoff === 0) {
        return {
            allowed: true,
            reason: "ok",
            minutesUntilReservation: minutesUntil,
            cutoffMinutes: 0
        };
    }

    if (minutesUntil === null) {
        return {
            allowed: false,
            reason: "invalid_datetime",
            minutesUntilReservation: null,
            cutoffMinutes: cutoff
        };
    }

    const allowed = minutesUntil >= cutoff;
    return {
        allowed,
        reason: allowed ? "ok" : "cutoff_passed",
        minutesUntilReservation: minutesUntil,
        cutoffMinutes: cutoff
    };
}
