/**
 * Graduated pricing tiers for CataloGlobe per-seat subscription.
 * Each tier defines an upper bound and price per seat within that range.
 */
const TIERS = [
    { upTo: 3, pricePerSeat: 39 },
    { upTo: 10, pricePerSeat: 29 },
    { upTo: 25, pricePerSeat: 19 },
] as const;

export const MAX_SEATS = 25;

export interface PricingBreakdown {
    /** Total monthly cost in EUR */
    total: number;
    /** Per-tier breakdown: { from, to, count, unitPrice, subtotal } */
    tiers: { from: number; to: number; count: number; unitPrice: number; subtotal: number }[];
}

/**
 * Calculates the graduated monthly price for a given number of seats.
 * Returns the total and a per-tier breakdown.
 */
export function calculatePrice(seats: number): PricingBreakdown {
    const result: PricingBreakdown = { total: 0, tiers: [] };
    let remaining = seats;
    let prev = 0;

    for (const tier of TIERS) {
        if (remaining <= 0) break;

        const slotCount = tier.upTo - prev;
        const used = Math.min(remaining, slotCount);

        result.tiers.push({
            from: prev + 1,
            to: prev + used,
            count: used,
            unitPrice: tier.pricePerSeat,
            subtotal: used * tier.pricePerSeat,
        });

        result.total += used * tier.pricePerSeat;
        remaining -= used;
        prev = tier.upTo;
    }

    return result;
}

/**
 * Returns a concise price string: "€453/mese"
 */
export function formatPrice(seats: number): string {
    const { total } = calculatePrice(seats);
    return `€${total}/mese`;
}

/**
 * Returns a detailed breakdown string for the pricing.
 * Example: "3 sedi × €39 + 2 sedi × €29 = €175/mese"
 * Kept for tooltips/expandable detail — not shown in main UI.
 */
export function formatPricingBreakdown(seats: number): string {
    const { total, tiers } = calculatePrice(seats);

    if (tiers.length === 1) {
        return `${seats} sed${seats === 1 ? "e" : "i"} × €${tiers[0].unitPrice} = €${total}/mese`;
    }

    const parts = tiers.map(t => `${t.count} sed${t.count === 1 ? "e" : "i"} × €${t.unitPrice}`);
    return `${parts.join(" + ")} = €${total}/mese`;
}
