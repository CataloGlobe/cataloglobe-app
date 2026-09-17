/**
 * Il contatore dei coperti del giorno in Agenda (FASE 5.2b).
 *
 * Conta chi è atteso, presente o già servito: `pending`, `confirmed`,
 * `seated`, `completed`. Fuori `cancelled`, `declined`, `no_show`. Prima
 * contava solo `confirmed`, e il numero CALAVA durante la serata man mano
 * che l'host premeva «Arrivato» (stessa classe di errore della FASE 5.1,
 * contatore diverso). Le `pending` contano perché il numero deve essere
 * d'accordo con la lista che l'Agenda ha sotto, e perché sottostimare il
 * carico della serata è peggio che sovrastimarlo.
 *
 * NON riusare `occupiesCapacity` (src/utils/reservationCapacity.ts): quella
 * è la capienza, questa è il carico mostrato — due domande diverse, e
 * legarle farebbe sì che cambiare una cambi l'altra per sbaglio.
 */

import type { ReservationStatus, V2Reservation } from "@/types/reservation";

export const COVERS_COUNTED_STATUSES: ReadonlySet<ReservationStatus> = new Set<ReservationStatus>([
    "pending",
    "confirmed",
    "seated",
    "completed"
]);

export function countsForCovers(status: ReservationStatus): boolean {
    return COVERS_COUNTED_STATUSES.has(status);
}

export function coversFor(list: readonly Pick<V2Reservation, "status" | "party_size">[]): number {
    return list.reduce((sum, r) => (countsForCovers(r.status) ? sum + r.party_size : sum), 0);
}
