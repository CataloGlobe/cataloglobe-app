// Quali gesti della tavolata mostrare nel drawer, dato lo stato della
// prenotazione e i permessi di chi guarda.
//
// Logica pura e fuori dal JSX apposta: è una regola, e una regola si testa.
// Stesso criterio di `reminderStatus.ts`.

import type { ReservationStatus } from "@/types/reservation";

export type SeatingActionKey =
    /** L'ospite è arrivato: apre la tavolata. */
    | "arrive"
    /** Il servizio è finito: chiude la tavolata. */
    | "complete"
    /** "Ho premuto sul nome sbagliato": cancella la tavolata. */
    | "undo_arrival";

export interface SeatingActionsInput {
    status: ReservationStatus;
    /** `canDoOnActivity(perms, 'seatings.manage', activityId)`. */
    canManageSeatings: boolean;
}

/**
 * I gesti disponibili, nell'ordine in cui vanno letti (mai disegnati: la
 * disposizione è affare del footer, che deve tenere `undo_arrival` e
 * `complete` visivamente distanti).
 *
 * Senza permesso: nessun gesto. Non disabilitati — proprio non disegnati, come
 * fanno già le azioni esistenti del drawer. Un bottone spento che non si può
 * accendere è rumore, non informazione.
 *
 * `completed` non ha gesti: il servizio è finito ed è terminale. Riaprirlo è
 * un'operazione che oggi non esiste, e fingere il contrario con un bottone che
 * fallisce sarebbe peggio dell'assenza.
 *
 * `pending` non ha "arrivato": non si fa sedere qualcuno la cui richiesta il
 * locale non ha ancora accettato. Se è arrivato lo stesso, l'host conferma
 * prima — è un gesto che già esiste e lascia la traccia giusta (il cliente
 * riceve la sua email).
 */
export function seatingActionsFor({
    status,
    canManageSeatings
}: SeatingActionsInput): SeatingActionKey[] {
    if (!canManageSeatings) return [];
    if (status === "confirmed") return ["arrive"];
    if (status === "seated") return ["complete", "undo_arrival"];
    return [];
}

export function hasSeatingAction(
    input: SeatingActionsInput,
    key: SeatingActionKey
): boolean {
    return seatingActionsFor(input).includes(key);
}
