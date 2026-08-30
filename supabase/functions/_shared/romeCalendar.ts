// Calendar arithmetic in the venue's local time.
//
// Pure: no I/O, no clock of its own — the instant is always injected, so the
// DST cases are testable rather than hopeful. Same assumption as everywhere
// else in the product: the venue's day is the Rome day.
//
// TODO multi-region: read the zone from `activities.iana_timezone` when
// non-IT tenants arrive. Every function here already takes the zone as an
// argument for that reason.

export const ROME_TIMEZONE = "Europe/Rome";

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Calendar date at `instant`, as seen in `timeZone`. `YYYY-MM-DD`.
 *
 * Assembled from `formatToParts` rather than from a locale that happens to
 * print ISO: a runtime built without the `en-CA` data silently falls back to
 * US ordering and `format()` returns `07/15/2026`. Reading the parts makes the
 * output independent of which locales the runtime shipped with — the same
 * reason `openingHours.ts` does it this way.
 */
export function isoDateInTimeZone(instant: Date, timeZone: string = ROME_TIMEZONE): string {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
            timeZone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        })
            .formatToParts(instant)
            .map(p => [p.type, p.value])
    ) as Record<string, string>;

    return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * Adds (or subtracts) whole days to an ISO date, staying on the calendar.
 *
 * Deliberately NOT "add 24 hours to an instant": on the two DST days a
 * 24-hour jump lands an hour off, and one of those hours is enough to skip or
 * repeat a day when the caller runs near midnight. Calendar arithmetic in UTC
 * has no such days.
 *
 * Returns null on anything that is not a real date, so a bad input fails
 * visibly at the caller instead of producing a plausible wrong date.
 */
export function addDaysToIsoDate(isoDate: unknown, days: number): string | null {
    if (typeof isoDate !== "string" || !Number.isInteger(days)) return null;
    const match = ISO_DATE_RE.exec(isoDate.trim());
    if (!match) return null;

    const [, y, m, d] = match;
    const year = Number(y);
    const month = Number(m);
    const day = Number(d);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const base = Date.UTC(year, month - 1, day);
    const roundTrip = new Date(base);
    // Rejects overflow dates: 2026-02-30 would silently roll into March.
    if (
        roundTrip.getUTCFullYear() !== year ||
        roundTrip.getUTCMonth() !== month - 1 ||
        roundTrip.getUTCDate() !== day
    ) {
        return null;
    }

    const shifted = new Date(base + days * 86400000);
    const yyyy = String(shifted.getUTCFullYear()).padStart(4, "0");
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(shifted.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * The day after the local day containing `instant`. `YYYY-MM-DD`.
 *
 * This is the reminder's target: run in the evening, mail the people booked
 * for tomorrow.
 */
export function tomorrowIsoDate(instant: Date, timeZone: string = ROME_TIMEZONE): string {
    const today = isoDateInTimeZone(instant, timeZone);
    // `today` comes from Intl and is always well-formed, so the null branch is
    // unreachable; the fallback exists so the return type stays a plain string.
    return addDaysToIsoDate(today, 1) ?? today;
}
