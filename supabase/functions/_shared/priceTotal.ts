import type Stripe from "https://esm.sh/stripe@17?target=deno";

/**
 * Minimal shape of a Stripe Price needed to compute a recurring total.
 * Kept structural so the pure helper is testable without the Stripe SDK.
 */
export interface PriceForTotal {
    billing_scheme?: string | null;
    unit_amount?: number | null;
    tiers_mode?: string | null;
    tiers?: Array<{
        up_to: number | null;
        unit_amount: number | null;
        flat_amount: number | null;
    }> | null;
}

/**
 * Totale ricorrente PIENO (in centesimi) di un Price a `quantity` sedi, al
 * lordo di coupon e indipendente da qualsiasi schedule.
 *
 * I Price CataloGlobe sono `per_unit` (ogni sede a prezzo pieno, dal
 * 2026-10-05). I vecchi Price graduated-tiered (sconto dalla seconda sede)
 * restano gestiti finché ci sono abbonamenti sopra.
 * Ritorna null su shape inattesa o quantity oltre i tiers.
 */
export function priceTotalCents(price: PriceForTotal, quantity: number): number | null {
    if (price.billing_scheme === "per_unit") {
        return price.unit_amount != null ? price.unit_amount * quantity : null;
    }
    if (
        price.billing_scheme !== "tiered" ||
        price.tiers_mode !== "graduated" ||
        !Array.isArray(price.tiers)
    ) {
        return null;
    }
    const tiers = [...price.tiers].sort((a, b) => {
        const au = a.up_to ?? Number.POSITIVE_INFINITY;
        const bu = b.up_to ?? Number.POSITIVE_INFINITY;
        return au - bu;
    });
    let remaining = quantity;
    let lower = 0;
    let total = 0;
    for (const tier of tiers) {
        if (remaining <= 0) break;
        const upTo = tier.up_to ?? Number.POSITIVE_INFINITY;
        const units = Math.min(remaining, upTo - lower);
        if (units <= 0) continue;
        total += (tier.flat_amount ?? 0) + (tier.unit_amount ?? 0) * units;
        remaining -= units;
        lower = upTo;
    }
    return remaining > 0 ? null : total;
}

/**
 * Come priceTotalCents, recuperando il Price da Stripe (l'item di una
 * subscription non porta i tiers: serve expand). Ritorna null su errore,
 * con un log che porta `tag`: i caller decidono il fallback.
 */
export async function retrievePriceTotalCents(
    stripe: Stripe,
    priceId: string,
    quantity: number,
    tag: string
): Promise<number | null> {
    try {
        const price = await stripe.prices.retrieve(priceId, { expand: ["tiers"] });
        const total = priceTotalCents(price, quantity);
        if (total == null) {
            console.warn(
                `${tag}: totale non calcolabile per ${priceId} (scheme=${price.billing_scheme}, mode=${price.tiers_mode}, quantity=${quantity})`
            );
        }
        return total;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${tag}: prices.retrieve fallito per ${priceId}: ${message}`);
        return null;
    }
}
