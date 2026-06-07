// Reservation capacity engine — pure, environment-agnostic.
//
// Computes peak concurrent covers in the candidate's [start, start+duration)
// window using a sweep-line over (start: +party_size, end: -party_size)
// events. Half-open intervals: at a shared instant, departures fire before
// arrivals, so a 19:00-21:00 reservation does NOT collide with a 21:00-23:00.
//
// Time axis is continuous minutes spanning the candidate's reference date
// and the adjacent days (D-1, D, D+1) so reservations across midnight
// (e.g. 23:30 vs 00:30) are scored correctly. Same technique as the
// previous +/-90 aggregate in ReservationDetailDrawer.
//
// IMPORTANT - this module is duplicated server-side in
// supabase/functions/submit-reservation/index.ts (search for the
// SYNC: src/utils/reservationCapacity.ts block). Keep both in sync.

export interface CapacityReservation {
    id: string;
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
    status: "pending" | "confirmed" | "declined" | "cancelled";
}

export interface CapacityCandidate {
    id?: string;
    activity_id: string;
    reservation_date: string;
    reservation_time: string;
    party_size: number;
}

const MINUTES_PER_DAY = 1440;
const ACTIVE_STATUSES: ReadonlySet<CapacityReservation["status"]> = new Set([
    "pending",
    "confirmed"
]);

function parseLocalDate(iso: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!y || !mo || !d) return null;
    return new Date(y, mo - 1, d);
}

function timeToMinutes(time: string): number {
    const m = /^(\d{2}):(\d{2})/.exec(time);
    if (!m) return Number.NaN;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return Number.NaN;
    return hh * 60 + mm;
}

function diffInDays(target: Date, reference: Date): number {
    const ms = target.getTime() - reference.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Convert a (date, time) pair into the candidate's minute axis: 0 = start
// of the candidate's local day. Negative for the previous day, beyond 1440
// for the next day. Returns NaN if the date isn't within [D-1, D+1] of the
// reference (rows outside that band don't affect the candidate window).
function toRelativeMinutes(
    isoDate: string,
    time: string,
    referenceDate: Date
): number {
    const d = parseLocalDate(isoDate);
    if (!d) return Number.NaN;
    const offsetDays = diffInDays(d, referenceDate);
    if (offsetDays < -1 || offsetDays > 1) return Number.NaN;
    const m = timeToMinutes(time);
    if (Number.isNaN(m)) return Number.NaN;
    return offsetDays * MINUTES_PER_DAY + m;
}

interface SweepEvent {
    t: number;
    delta: number;
    // 0 = arrival (delta > 0), 1 = departure (delta < 0). Sorted ascending,
    // so at equal t, departures fire BEFORE arrivals — half-open intervals.
    order: 0 | 1;
}

function buildEvents(
    rows: ReadonlyArray<CapacityReservation>,
    durationMin: number,
    referenceDate: Date
): SweepEvent[] {
    const events: SweepEvent[] = [];
    for (const r of rows) {
        if (!ACTIVE_STATUSES.has(r.status)) continue;
        if (r.party_size <= 0) continue;
        const start = toRelativeMinutes(r.reservation_date, r.reservation_time, referenceDate);
        if (Number.isNaN(start)) continue;
        const end = start + durationMin;
        events.push({ t: start, delta: r.party_size, order: 0 });
        events.push({ t: end, delta: -r.party_size, order: 1 });
    }
    return events;
}

function sortEvents(events: SweepEvent[]): SweepEvent[] {
    // Ascending by t; at equal t, departures (order=1) BEFORE arrivals
    // (order=0). Lower-order-first by sorting `b.order - a.order` (1 - 0 > 0).
    events.sort((a, b) => (a.t - b.t) || (b.order - a.order));
    return events;
}

export interface PeakOptions {
    /** Excludes a row by id (edit case: don't count the candidate twice). */
    excludeId?: string;
}

/**
 * Compute the maximum concurrent covers inside the candidate's window
 * [candidateStart, candidateStart + durationMin) across the supplied rows.
 *
 * Rows from other activities are ignored. Rows outside [D-1, D+1] of the
 * candidate's date are ignored (no effect on this window). The candidate
 * itself is NOT added by this function — callers that need that should
 * use `canAccept`.
 */
export function peakConcurrent(
    rows: ReadonlyArray<CapacityReservation>,
    candidate: CapacityCandidate,
    durationMin: number,
    options: PeakOptions = {}
): number {
    if (durationMin <= 0) return 0;
    const referenceDate = parseLocalDate(candidate.reservation_date);
    if (!referenceDate) return 0;
    const candStart = toRelativeMinutes(
        candidate.reservation_date,
        candidate.reservation_time,
        referenceDate
    );
    if (Number.isNaN(candStart)) return 0;
    const candEnd = candStart + durationMin;

    const filtered = rows.filter(
        r => r.activity_id === candidate.activity_id && r.id !== options.excludeId
    );

    const events = sortEvents(buildEvents(filtered, durationMin, referenceDate));

    // Single pass with half-open semantics:
    //   - events with t < candStart contribute to baseline (level entering
    //     the window).
    //   - departures at t == candStart are ALSO baseline (they free their
    //     covers exactly at the window opening — the row's interval is
    //     [start, end), so end=candStart means it's already gone).
    //   - everything else with t >= candStart and t < candEnd is in-window.
    //   - the peak inside the window is max(baseline, level after each
    //     in-window event).
    let level = 0;
    let peak = 0;
    let baselineLocked = false;
    for (const ev of events) {
        if (ev.t < candStart) {
            level += ev.delta;
            continue;
        }
        if (ev.t === candStart && ev.order === 1) {
            level += ev.delta;
            continue;
        }
        if (!baselineLocked) {
            peak = level;
            baselineLocked = true;
        }
        if (ev.t >= candEnd) break;
        level += ev.delta;
        if (level > peak) peak = level;
    }
    // No in-window event reached — baseline IS the peak.
    if (!baselineLocked) peak = level;

    return Math.max(0, peak);
}

export interface CapacityConfig {
    /** NULL = no capacity gate (caller treats as unlimited). */
    capacity: number | null;
    /** Slot length in minutes. */
    durationMin: number;
}

export interface CanAcceptResult {
    ok: boolean;
    /** Peak concurrent covers including the candidate. */
    peakWithCandidate: number;
    reason?: "over_capacity";
}

/**
 * Returns whether a candidate reservation fits under the activity's capacity,
 * plus the peak concurrent covers in the candidate's window AFTER the
 * candidate is added. When `capacity` is null the engine still returns the
 * peak (useful for UI display) but always reports `ok: true`.
 */
export function canAccept(
    config: CapacityConfig,
    rows: ReadonlyArray<CapacityReservation>,
    candidate: CapacityCandidate
): CanAcceptResult {
    const { capacity, durationMin } = config;
    const synthetic: CapacityReservation = {
        id: candidate.id ?? "__candidate__",
        activity_id: candidate.activity_id,
        reservation_date: candidate.reservation_date,
        reservation_time: candidate.reservation_time,
        party_size: candidate.party_size,
        status: "pending"
    };
    const withoutSelf = rows.filter(r => r.id !== synthetic.id);
    const peakWithCandidate = peakConcurrent(
        [...withoutSelf, synthetic],
        candidate,
        durationMin
    );
    if (capacity === null) {
        return { ok: true, peakWithCandidate };
    }
    if (peakWithCandidate <= capacity) {
        return { ok: true, peakWithCandidate };
    }
    return { ok: false, peakWithCandidate, reason: "over_capacity" };
}

// Public helper for callers that want the raw conversion.
export { timeToMinutes };
