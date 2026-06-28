// Pure, self-contained helpers for opening-hours time math. No UI imports, so
// the module is importable from Vitest (node env) without dragging the React
// component tree. Used by ActivityHoursForm for slot overlap detection and for
// deriving the overnight-close flag.

export function timesToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
}

// Derives the overnight-close flag deterministically from the (opens_at,
// closes_at) pair, independent of which field was edited last. Mirrors the DB
// CHECK `activity_hours_time_coherence`: an overnight slot (closes_at <
// opens_at, including closes_at = "00:00") is only valid with closes_next_day =
// true. Kept in sync with slotsOverlap()'s +1440 semantics and availability.ts.
export function deriveClosesNextDay(
    opensAt: string | null,
    closesAt: string | null
): boolean {
    if (!opensAt || !closesAt) return false;
    return timesToMinutes(closesAt) < timesToMinutes(opensAt);
}
