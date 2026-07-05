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

/**
 * Shift a `YYYY-MM-DD` string by `n` calendar days, returning `YYYY-MM-DD`.
 * Pure calendar arithmetic on local fields: only Y-M-D matter, so DST /
 * timezone offsets never skew the result. Malformed input returns unchanged.
 */
export function shiftIsoDate(iso: string, n: number): string {
    const y = Number(iso.slice(0, 4));
    const mo = Number(iso.slice(5, 7));
    const d = Number(iso.slice(8, 10));
    if (!y || !mo || !d) return iso;
    const shifted = new Date(y, mo - 1, d + n);
    return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}-${String(shifted.getDate()).padStart(2, "0")}`;
}
