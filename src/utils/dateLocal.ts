/**
 * Local wall-clock date helpers.
 *
 * Reservations, opening hours and any other "wall-clock local" use case
 * must build / format dates from the browser's local fields (`getFullYear`,
 * `getMonth`, `getDate`) — NEVER `new Date("YYYY-MM-DD")` which is parsed
 * as UTC and shifts by a day in timezones west of UTC.
 *
 * These primitives are intentionally pure and free of `Intl`: callers in
 * charge of localized formatting wrap them with their own
 * `Intl.DateTimeFormat` setup.
 */

/** Today's date in the browser's local timezone as `YYYY-MM-DD`. */
export function todayIsoDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Returns a new Date `n` days after `date`. Constructed from local fields
 * so DST transitions and timezone offsets do not skew the result by a few
 * hours.
 */
export function addDays(date: Date, n: number): Date {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + n);
    return d;
}
