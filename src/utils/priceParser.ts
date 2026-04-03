/**
 * Parses a price string that may use either a dot or a comma as the decimal separator.
 *
 * Examples:
 *   "1.5"  → 1.5
 *   "1,5"  → 1.5
 *   ",5"   → 0.5
 *   "1,"   → NaN  (trailing comma with no decimal digits is invalid)
 *   "1..5" → NaN
 *   ""     → NaN
 *
 * @param value - Raw string from a price input field
 * @returns A finite number, or NaN if the input is not a valid price
 */
export function parseDecimalPrice(value: string): number {
    const trimmed = value.trim();
    if (!trimmed) return NaN;

    // Replace the first comma with a dot (European decimal separator).
    // If there is more than one dot/comma after replacement the result is NaN.
    const normalized = trimmed.replace(",", ".");

    const parsed = parseFloat(normalized);

    // Reject values where the string contains leftover non-numeric content
    // (e.g. "1..5" → parseFloat gives 1, but "1..5" !== "1").
    // A simple validity gate: the parsed value must reconstruct back to the
    // same numeric quantity without producing NaN.
    if (Number.isNaN(parsed)) return NaN;

    // Extra safety: reject strings that have multiple dots (e.g. "1..5")
    if ((normalized.match(/\./g) ?? []).length > 1) return NaN;

    return parsed;
}

/**
 * Returns true when a raw price string is a valid, positive price.
 */
export function isValidPrice(value: string): boolean {
    const n = parseDecimalPrice(value);
    return !Number.isNaN(n) && n > 0;
}
