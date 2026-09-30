// =============================================================================
// Per-plan graduated pricing (used by the create-business wizard)
// =============================================================================
//
// `unit_price_cents` is the first-seat price for the CHOSEN billing interval
// (from `plan_prices`: 3900 monthly, 39000 yearly); `volume_discount_threshold`
// and `volume_discount_percent` come from `plans` and are interval-agnostic.
// Stripe applies the *real* graduated pricing at checkout; the helpers below
// are only for client-side display (wizard + Abbonamento page).

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
    plan: { unit_price_cents: number | null; volume_discount_threshold: number; volume_discount_percent: number },
    seats: number
): GraduatedBreakdown {
    const fullPrice = (plan.unit_price_cents ?? 0) / 100;
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

// =============================================================================
// «La prossima sede» — quanto costa aggiungere una sede al piano corrente
// =============================================================================

export type NextSeatOffer =
    /** Sedi pagate ancora libere: aprirne una non costa. */
    | { kind: "free"; freeSeats: number }
    /** Al limite, entro il tetto self-service: prezzo della sede in più. */
    | {
          kind: "upgrade";
          /** Costo per periodo della sede aggiuntiva, sconto volume applicato, in centesimi. */
          extraPriceCents: number;
          /** Prezzo di listino della sede (senza sconto volume), in centesimi. */
          listPriceCents: number;
          volumeDiscountPercent: number;
      }
    /** Al tetto self-service (`max_self_service_seats`): solo assistenza. */
    | { kind: "contact"; cap: number };

/**
 * Stessa aritmetica di `calculateGraduatedFromPlan`: la sede in più costa la
 * differenza fra il totale a `paidSeats + 1` e quello a `paidSeats`. Usata da
 * Abbonamento (card «La prossima sede») e dall'offerta nel drawer «Aggiungi
 * sede» (§37.6, §37.7): una sola fonte per il prezzo.
 */
export function nextSeatOffer(
    plan: {
        unit_price_cents: number | null;
        volume_discount_threshold: number;
        volume_discount_percent: number;
        max_self_service_seats: number;
    },
    paidSeats: number,
    usedSeats: number
): NextSeatOffer {
    if (usedSeats < paidSeats) return { kind: "free", freeSeats: paidSeats - usedSeats };
    if (paidSeats >= plan.max_self_service_seats) return { kind: "contact", cap: plan.max_self_service_seats };
    const current = calculateGraduatedFromPlan(plan, paidSeats);
    const next = calculateGraduatedFromPlan(plan, paidSeats + 1);
    return {
        kind: "upgrade",
        extraPriceCents: Math.round((next.subtotal - current.subtotal) * 100),
        listPriceCents: Math.round(next.fullPrice * 100),
        volumeDiscountPercent: plan.volume_discount_percent
    };
}
