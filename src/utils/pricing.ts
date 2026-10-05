// =============================================================================
// Prezzo delle sedi (wizard «Crea attività» e pagina Abbonamento)
// =============================================================================
//
// Ogni sede paga il prezzo pieno del piano (nessuno sconto dalla seconda sede,
// dal 2026-10-05). `unit_price_cents` è il prezzo per sede dell'intervallo
// scelto (da `plan_prices`: 3900 mensile, 39000 annuale). Stripe addebita il
// Price `per_unit`; questi helper servono solo a mostrare i prezzi.

export interface SeatsPricing {
    seats: number;
    /** Prezzo di una sede, in euro. */
    unitPrice: number;
    /** `seats × unitPrice`, in euro. */
    subtotal: number;
}

export const EMPTY_SEATS_PRICING: SeatsPricing = { seats: 0, unitPrice: 0, subtotal: 0 };

export function calculateSeatsPricing(plan: { unit_price_cents: number | null }, seats: number): SeatsPricing {
    const unitCents = plan.unit_price_cents ?? 0;
    return { seats, unitPrice: unitCents / 100, subtotal: (unitCents * seats) / 100 };
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
          /** Costo per periodo della sede aggiuntiva, in centesimi. */
          extraPriceCents: number;
      }
    /** Al tetto self-service (`max_self_service_seats`): solo assistenza. */
    | { kind: "contact"; cap: number };

/**
 * Quanto costa la sede in più. Usata da Abbonamento (card «La prossima sede»)
 * e dall'offerta nel drawer «Aggiungi sede» (§37.6, §37.7): una sola fonte per
 * il prezzo.
 */
export function nextSeatOffer(
    plan: { unit_price_cents: number | null; max_self_service_seats: number },
    paidSeats: number,
    usedSeats: number
): NextSeatOffer {
    if (usedSeats < paidSeats) return { kind: "free", freeSeats: paidSeats - usedSeats };
    if (paidSeats >= plan.max_self_service_seats) return { kind: "contact", cap: plan.max_self_service_seats };
    return { kind: "upgrade", extraPriceCents: plan.unit_price_cents ?? 0 };
}
