import type { V2Reservation } from "@/types/reservation";
import type { DateRange } from "./loadWindow";

// `no_show` NON sta qui, di proposito. `declined` e `cancelled` sono decisioni
// prese PRIMA del servizio: una volta prese non interessa più vederle. Un
// no-show è invece un fatto accaduto DURANTE quel servizio e fa parte di
// com'è andata la serata, quindi resta visibile nella vista del giorno —
// distinto dal badge "Non presentato". Vale anche per la correzione: annullare
// una marcatura sbagliata non deve stare dietro il toggle "mostra terminali".
export const AGENDA_TERMINAL = new Set<V2Reservation["status"]>(["declined", "cancelled"]);

/**
 * Le prenotazioni che l'Agenda mostra, nell'ordine in cui si leggono: i sette
 * giorni della settimana, per giorno e ora, senza annullate e rifiutate se il
 * filtro le nasconde. Le usano l'Agenda e le frecce del dettaglio (D131), così
 * «2 di 5» e ↑ ↓ contano solo le righe che si vedono.
 */
export function agendaVisible(items: readonly V2Reservation[], week: DateRange, showTerminal: boolean): V2Reservation[] {
    return items
        .filter(r => r.reservation_date >= week.from && r.reservation_date <= week.to)
        .filter(r => showTerminal || !AGENDA_TERMINAL.has(r.status))
        .sort((a, b) =>
            a.reservation_date === b.reservation_date
                ? a.reservation_time.localeCompare(b.reservation_time)
                : a.reservation_date.localeCompare(b.reservation_date)
        );
}
