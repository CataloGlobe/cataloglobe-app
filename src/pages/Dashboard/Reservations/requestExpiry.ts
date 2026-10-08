import type { V2Reservation } from "@/types/reservation";

/**
 * Una richiesta (pending) del giorno già passato è scaduta (T19): si può solo
 * rifiutare. Stesso confine di `respond-reservation`, che rifiuta la conferma
 * (`RESERVATION_EXPIRED`): il giorno, non l'ora. `today` da `todayIsoDate()`.
 */
export function isExpiredRequest(
    reservation: Pick<V2Reservation, "status" | "reservation_date">,
    today: string
): boolean {
    return reservation.status === "pending" && reservation.reservation_date < today;
}
