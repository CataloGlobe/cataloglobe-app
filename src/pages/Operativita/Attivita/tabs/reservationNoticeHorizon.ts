// Pure helpers for the "Quando si può prenotare online" fields of the
// reservations tab (FASE 4.3). Kept out of the .tsx so vitest can test them.

/** Same bounds as the CHECK constraints in migration 20260915150000. */
export const MIN_NOTICE_MINUTES_MAX = 10080;
export const HORIZON_DAYS_MIN = 1;
export const HORIZON_DAYS_MAX = 365;

/**
 * True when the notice pushes the first bookable instant past the whole
 * horizon: with notice > horizon × 24h nothing is bookable online. A warning,
 * never a block — the configuration is legal, just almost certainly a mistake.
 * Non-numeric drafts never warn (the save validation reports them).
 */
export function noticeExceedsHorizon(minNoticeMinutes: number, horizonDays: number): boolean {
    if (!Number.isFinite(minNoticeMinutes) || !Number.isFinite(horizonDays)) return false;
    return minNoticeMinutes > horizonDays * 24 * 60;
}
