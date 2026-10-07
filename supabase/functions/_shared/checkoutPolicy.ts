// Pure checkout policies for stripe-checkout, kept apart so they can be
// unit-tested without Stripe or Deno.

/** Trial length when nothing else says otherwise (first subscription, or a
 *  card-free code without `trial_days`). */
export const DEFAULT_TRIAL_PERIOD_DAYS = 30;
/** Upper bound for a card-free code's `trial_days`: six months. */
export const MAX_TRIAL_PERIOD_DAYS = 180;
/** Promotion code metadata key that sets the card-free trial length. */
export const TRIAL_DAYS_METADATA_KEY = "trial_days";

/**
 * Trial length carried by a card-free promotion code.
 *
 * - key missing or empty → `DEFAULT_TRIAL_PERIOD_DAYS` (today's behaviour);
 * - a whole number from 1 to `MAX_TRIAL_PERIOD_DAYS` → that number;
 * - anything else (decimals, signs, text, over the cap) → `null`: the caller
 *   refuses the code. A misconfigured code must not silently grant 30 days
 *   when 6 months were promised, nor more than the cap.
 */
export function resolvePromoTrialDays(
    metadata: Record<string, string> | null | undefined
): number | null {
    const raw = metadata?.[TRIAL_DAYS_METADATA_KEY]?.trim() ?? "";
    if (raw === "") return DEFAULT_TRIAL_PERIOD_DAYS;
    if (!/^\d+$/.test(raw)) return null;
    const days = Number(raw);
    if (days < 1 || days > MAX_TRIAL_PERIOD_DAYS) return null;
    return days;
}

/**
 * Where Checkout may send the user back. A URL from the request body is used
 * only when it is absolute and its origin is one of ours; otherwise `null`
 * and the caller refuses the request (no open redirect through Stripe).
 */
export function resolveReturnUrl(
    requested: string | null | undefined,
    allowedOrigins: readonly string[]
): string | null {
    if (!requested) return null;
    let url: URL;
    try {
        url = new URL(requested);
    } catch {
        return null;
    }
    if (url.username || url.password) return null;
    return allowedOrigins.includes(url.origin) ? url.href : null;
}

/** The fields of a Stripe promotion code (and its coupon) that limit its use. */
export interface PromoCodeLimits {
    active: boolean;
    expires_at: number | null;
    max_redemptions: number | null;
    times_redeemed: number;
    coupon?: {
        valid?: boolean;
        redeem_by?: number | null;
        max_redemptions?: number | null;
        times_redeemed?: number;
    } | null;
}

export type PromoCodeRefusal = "promo_code_invalid" | "promo_code_expired" | "promo_code_used_up";

/**
 * Whether a promotion code can still be used, checked by us before Checkout.
 *
 * Stripe enforces `expires_at` and `max_redemptions` only when it applies the
 * coupon. A card-free trial code never has its coupon applied (it is only a key
 * to the trial), so Stripe never counts it: `extraRedemptions` is how many
 * subscriptions we already created with it, added to Stripe's own count.
 * Times are Unix seconds, as Stripe sends them.
 */
export function checkPromoCodeLimits(
    promo: PromoCodeLimits,
    nowSeconds: number,
    extraRedemptions = 0
): PromoCodeRefusal | null {
    if (!promo.active || promo.coupon?.valid === false) return "promo_code_invalid";

    const expiries = [promo.expires_at, promo.coupon?.redeem_by].filter(
        (t): t is number => typeof t === "number"
    );
    if (expiries.some(t => t <= nowSeconds)) return "promo_code_expired";

    const used = promo.times_redeemed + extraRedemptions;
    if (promo.max_redemptions != null && used >= promo.max_redemptions) return "promo_code_used_up";
    const couponMax = promo.coupon?.max_redemptions;
    if (couponMax != null && (promo.coupon?.times_redeemed ?? 0) + extraRedemptions >= couponMax) {
        return "promo_code_used_up";
    }
    return null;
}
