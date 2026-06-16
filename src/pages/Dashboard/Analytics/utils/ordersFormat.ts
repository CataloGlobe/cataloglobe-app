// Formatting helpers for the Orders analytics section.
// Single-currency (EUR) today — see migration 20260615130000 note for the
// multi-region TODO.

const eurFormatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
});

export function formatEur(value: number): string {
    return eurFormatter.format(value);
}

/**
 * Human-readable duration from seconds.
 *   45      → "45s"
 *   90      → "1m 30s"
 *   3720    → "1h 2m"
 * Returns "—" for non-positive / missing values.
 */
export function formatDuration(seconds: number): string {
    if (!seconds || seconds <= 0) return "—";
    const total = Math.round(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}
