// Riallineo dei posti al collegamento dell'abbonamento (CG-03, D10).
// Senza import: lo usano le Edge Function (Deno) e i test vitest.
//
// Il controllo posti contro sedi di `stripe-checkout` vale quando la sessione
// nasce. Nei 31 minuti in cui resta aperta il tenant può aggiungere sedi (il
// trigger `enforce_seat_limit` le confronta con il `paid_seats` vecchio, che
// può essere più alto). Quando webhook o conferma collegano l'abbonamento le
// sedi si ricontano: se sono più dei posti pagati, la quantity sale.

/** Tetto dei posti che si comprano online (come in `stripe-checkout`). */
export const MAX_SELF_SERVICE_SEATS = 5;

export type SeatRealignPlan =
    | { action: "none" }
    | { action: "raise"; to: number }
    | { action: "over_cap"; activities: number };

/**
 * Cosa fare con la quantity dell'abbonamento appena collegato.
 * Solo in su, mai in giù: meno sedi dei posti è una scelta del cliente
 * (posti liberi già pagati), e abbassare toccherebbe un rimborso.
 */
export function planSeatRealign(
    quantity: number,
    activityCount: number,
    cap: number = MAX_SELF_SERVICE_SEATS
): SeatRealignPlan {
    if (activityCount <= quantity) return { action: "none" };
    if (activityCount > cap) return { action: "over_cap", activities: activityCount };
    return { action: "raise", to: activityCount };
}
