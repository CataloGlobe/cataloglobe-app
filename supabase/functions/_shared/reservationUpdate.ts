// La regola della notifica quando l'operatore modifica una prenotazione.
// Pura, senza I/O, cosi' si testa senza tirare su la Edge.
//
// La mail parte DA SOLA quando cambiano data o ora, e per nient'altro:
// coperti, contatti, note, tavoli non fanno partire niente. Lo spostamento e'
// l'unico cambiamento che fa presentare un ospite nel momento sbagliato, e
// una spunta da decidere a ogni salvataggio costa piu' di quello che
// risparmia. Nessuna impostazione per sede.
//
// Non parte se non c'e' un indirizzo a cui scrivere, e non parte se la
// prenotazione e' in uno stato che non prevede la presenza del cliente: non
// c'e' piu' un appuntamento da spostare.

/** Stati in cui il cliente NON e' atteso: una modifica non gli dice niente. */
export const NO_CUSTOMER_EXPECTED_STATUSES: readonly string[] = ["cancelled", "declined", "no_show"];

export interface ReservationMoveSnapshot {
    reservation_date: string;
    /** `HH:MM` o `HH:MM:SS`: Postgres rende i secondi, il form no. */
    reservation_time: string;
    status: string;
    customer_email: string | null;
}

/** Stesso istante a muro, secondi ignorati: `20:00` e `20:00:00` sono uguali. */
function sameTime(a: string, b: string): boolean {
    return a.trim().slice(0, 5) === b.trim().slice(0, 5);
}

/** True se data o ora sono cambiate: e' l'evento nel calendario a essere un altro. */
export function isReservationMoved(
    before: Pick<ReservationMoveSnapshot, "reservation_date" | "reservation_time">,
    after: Pick<ReservationMoveSnapshot, "reservation_date" | "reservation_time">
): boolean {
    return (
        before.reservation_date.trim() !== after.reservation_date.trim() ||
        !sameTime(before.reservation_time, after.reservation_time)
    );
}

export type MoveNotificationSkip = "not_moved" | "no_email" | "no_customer_expected";

export type MoveNotificationDecision =
    | { notify: true }
    | { notify: false; reason: MoveNotificationSkip };

/**
 * Decide se lo spostamento produce una mail. Lo stato si legge DOPO la
 * modifica (e' quello che vale), l'indirizzo pure: un'email aggiunta nello
 * stesso salvataggio che sposta la data e' un indirizzo a cui scrivere.
 */
export function decideMoveNotification(
    before: ReservationMoveSnapshot,
    after: ReservationMoveSnapshot
): MoveNotificationDecision {
    if (!isReservationMoved(before, after)) return { notify: false, reason: "not_moved" };
    if (NO_CUSTOMER_EXPECTED_STATUSES.includes(after.status)) {
        return { notify: false, reason: "no_customer_expected" };
    }
    const email = typeof after.customer_email === "string" ? after.customer_email.trim() : "";
    if (email.length === 0) return { notify: false, reason: "no_email" };
    return { notify: true };
}
