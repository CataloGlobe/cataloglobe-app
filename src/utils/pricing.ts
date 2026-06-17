// =============================================================================
// Per-plan graduated pricing (used by the create-business wizard)
// =============================================================================
//
// The DB `plans` table carries `monthly_price_cents`, `volume_discount_threshold`
// and `volume_discount_percent`. Stripe applies the *real* graduated pricing at
// checkout; the helpers below are only for client-side display in the wizard.

export interface GraduatedSeatLine {
    seat: number;
    unitPrice: number;
    discounted: boolean;
}

export interface GraduatedBreakdown {
    lines: GraduatedSeatLine[];
    subtotal: number;
    fullPrice: number;
    discountedPrice: number;
}

/**
 * Computes the per-seat breakdown for the given plan + seats count.
 * Seats below `volume_discount_threshold` pay the full unit price; seats from
 * the threshold onward get the volume discount.
 */
export function calculateGraduatedFromPlan(
    plan: { monthly_price_cents: number | null; volume_discount_threshold: number; volume_discount_percent: number },
    seats: number
): GraduatedBreakdown {
    const fullPrice = (plan.monthly_price_cents ?? 0) / 100;
    const discountFactor = 1 - plan.volume_discount_percent / 100;
    const discountedPrice = Math.round(fullPrice * discountFactor * 100) / 100;
    const threshold = Math.max(1, plan.volume_discount_threshold);

    const lines: GraduatedSeatLine[] = [];
    let subtotal = 0;

    for (let seat = 1; seat <= seats; seat++) {
        const discounted = seat >= threshold;
        const unitPrice = discounted ? discountedPrice : fullPrice;
        lines.push({ seat, unitPrice, discounted });
        subtotal += unitPrice;
    }

    return {
        lines,
        subtotal: Math.round(subtotal * 100) / 100,
        fullPrice,
        discountedPrice,
    };
}
