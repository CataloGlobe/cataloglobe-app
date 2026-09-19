// =============================================================================
// Plan prices by billing interval (pure helpers over `plan_prices` rows)
// =============================================================================
//
// The wizard offers only the intervals that are actually purchasable: an
// interval is available when EVERY public plan has a row for it. Production
// may have only monthly rows while staging already has yearly ones — the UI
// derives the choice from data instead of hard-coding it.

import { BILLING_INTERVALS, type BillingInterval, type PlanCode, type PlanPrice } from "@/types/plan";

export const DEFAULT_BILLING_INTERVAL: BillingInterval = "month";

/** Months covered by one billing period of the interval. */
export const MONTHS_PER_INTERVAL: Record<BillingInterval, number> = { month: 1, year: 12 };

/**
 * Intervals for which every plan in `planCodes` has a price row, in the fixed
 * display order month → year. Empty `planCodes` yields no interval (nothing
 * to sell). Rows with an interval outside the known domain are ignored.
 */
export function availableIntervals(prices: PlanPrice[], planCodes: PlanCode[]): BillingInterval[] {
    if (planCodes.length === 0) return [];
    return BILLING_INTERVALS.filter(interval =>
        planCodes.every(code => priceCentsFor(prices, code, interval) !== null)
    );
}

/** First-seat unit price in cents for (plan, interval), or null when not configured. */
export function priceCentsFor(prices: PlanPrice[], planCode: PlanCode, interval: BillingInterval): number | null {
    const row = prices.find(p => p.plan_code === planCode && p.billing_interval === interval);
    return row ? row.price_cents : null;
}

/**
 * What the same period would cost paying month by month, in cents — the
 * explicit comparison shown under a yearly price. Null when the monthly price
 * is unknown or the interval has no meaningful comparison (month itself).
 */
export function monthByMonthEquivalentCents(
    prices: PlanPrice[],
    planCode: PlanCode,
    interval: BillingInterval
): number | null {
    if (interval === "month") return null;
    const monthly = priceCentsFor(prices, planCode, "month");
    return monthly === null ? null : monthly * MONTHS_PER_INTERVAL[interval];
}

/**
 * The green line under a MONTHLY price that lets the customer know the yearly
 * option exists ("Con il piano annuale: €390/sede/anno, due mesi gratis").
 * Null unless yearly = 10 × monthly — otherwise the "two months free" claim
 * would be false. Under a yearly price the argument is made by the struck
 * month-by-month equivalent instead (see `monthByMonthEquivalentCents`).
 */
export function annualPitchNote(monthlyCents: number, yearlyCents: number): string | null {
    if (yearlyCents !== monthlyCents * (MONTHS_PER_INTERVAL.year - 2)) return null;
    return `Con il piano annuale: ${formatEuroWholeCents(yearlyCents)}/sede/${INTERVAL_PERIOD_NOUN.year}, due mesi gratis`;
}

/** `annualPitchNote` over `plan_prices` rows; null when either interval is not purchasable. */
export function annualPitchNoteFor(prices: PlanPrice[], planCode: PlanCode): string | null {
    const monthly = priceCentsFor(prices, planCode, "month");
    const yearly = priceCentsFor(prices, planCode, "year");
    if (monthly === null || yearly === null) return null;
    return annualPitchNote(monthly, yearly);
}

/** Whole euros for a price line ("€39", "€390"). */
export function formatEuroWholeCents(cents: number): string {
    return `€${Math.round(cents / 100)}`;
}

/** Keeps `interval` only if purchasable; otherwise falls back to the first available one. */
export function coerceInterval(interval: BillingInterval | null | undefined, available: BillingInterval[]): BillingInterval {
    if (interval && available.includes(interval)) return interval;
    return available.includes(DEFAULT_BILLING_INTERVAL) ? DEFAULT_BILLING_INTERVAL : (available[0] ?? DEFAULT_BILLING_INTERVAL);
}

// --- Interval wording (Italian UI copy, single source for wizard + Abbonamento) ---

/** Period noun for price units: "€39/mese", "€390/anno". */
export const INTERVAL_PERIOD_NOUN: Record<BillingInterval, string> = { month: "mese", year: "anno" };

/** Adjective for the billing-interval line: "Fatturazione mensile" / "annuale". */
export const INTERVAL_ADJECTIVE: Record<BillingInterval, string> = { month: "mensile", year: "annuale" };

/** Recurrence phrase for charge notes: "€701,00 ogni anno". */
export const INTERVAL_RECURRENCE: Record<BillingInterval, string> = { month: "ogni mese", year: "ogni anno" };

/** Unit suffix appended to a recurring amount: "/mese" or "/anno". */
export function intervalUnit(interval: BillingInterval): string {
    return `/${INTERVAL_PERIOD_NOUN[interval]}`;
}
