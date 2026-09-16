// Stato del promemoria di una prenotazione, per il drawer di dettaglio.
//
// Logica pura e separata dal componente: è la parte che vale la pena testare, e
// vitest non può importare alberi .tsx (vedi `memory/feedback_vitest_aliases`).
//
// ── Perché cinque casi e non due ────────────────────────────────────────────
// "Inviato / non inviato" nasconde proprio la cosa che il 09/09 non sapevamo
// vedere. Le colonne `reminder_sent_at` e `reminder_failed_at` sono NULL anche
// per una prenotazione che non è mai stata candidata, e quel NULL non è un
// guasto: leggerlo come tale riempirebbe la sera di allarmi per il caso più
// comune che esista (una prenotazione di fra due settimane).
//
// Quindi si distingue chi non ha ancora avuto il suo turno (`pending`) da chi
// non lo avrà mai (`not_planned`), e dentro i fallimenti si distingue chi ha
// perso il promemoria prima della rivendicazione (`failed`, riprovabile) da chi
// l'ha perso dopo (`claimed_not_delivered`, perso davvero).

import type { ReservationStatus } from "@/types/reservation";

export type ReminderState =
    /** Partito, nessun problema. */
    | "sent"
    /**
     * Rivendicato ma non consegnato: il claim è passato, l'email no. È una
     * perdita definitiva — la riga risulta "già inviata" a ogni passata
     * successiva — e va detta in chiaro invece di nasconderla sotto "inviato".
     */
    | "claimed_not_delivered"
    /** Un tentativo è fallito prima della rivendicazione. */
    | "failed"
    /** Candidata, ma l'ora del promemoria non è ancora arrivata. */
    | "pending"
    /** Non previsto: la sede ha il promemoria spento. */
    | "not_planned_venue"
    /** Non previsto: lo stato non è `confirmed`. */
    | "not_planned_status"
    /** Non previsto: la finestra è passata senza che fosse candidata. */
    | "not_planned_past";

/**
 * Fuso del dominio prenotazioni. Stessa assunzione di
 * `_shared/reservationCancellation.ts` (`RESERVATION_TIMEZONE`), di
 * `get_operative_day_start()` e di `openingHours.ts`: la sede è a Roma, e le
 * ore vanno rese lì, non nel fuso del browser di chi guarda.
 *
 * TODO multi-region: leggere la zona da `activities.iana_timezone` quando
 * arriveranno tenant non italiani.
 */
export const RESERVATION_TIMEZONE = "Europe/Rome";

/** Ultima ora italiana in cui una passata del promemoria può partire. */
const LAST_REMINDER_HOUR = 20;

/**
 * Come si legge un fallimento: passeggero o no.
 *
 * Serve a NON mostrare il messaggio grezzo del gateway a chi gestisce una sala.
 * `Gateway Timeout` non dice niente a un ristoratore, e "errore" secco lo
 * lascia senza sapere se deve fare qualcosa: la distinzione utile è fra
 * "riprova da solo / è passato" e "qualcosa non va".
 */
export type ReminderErrorKind = "transient" | "technical";

// ⚠️ SYNC — rispecchia `RETRIABLE_MESSAGE` e `RETRIABLE_SQLSTATES` di
// `supabase/functions/_shared/reminderClaim.ts`. Non è una duplicazione per
// distrazione: quel modulo è codice Deno fuori da `src`, e importarlo qui
// trascinerebbe l'edge dentro il typecheck del frontend. Se là cambia la
// classificazione, qui cambia l'etichetta.
const TRANSIENT_ERROR_RE =
    /gateway timeout|bad gateway|service unavailable|timed? ?out|timeout|network|fetch failed|failed to fetch|socket hang up|connection (?:closed|reset|refused|error)|econnreset|econnrefused|etimedout|ehostunreach|enotfound|upstream|\b(?:57014|40001|40P01|53300|55P03|08006)\b/i;

export function reminderErrorKind(message: string | null): ReminderErrorKind {
    if (!message) return "technical";
    return TRANSIENT_ERROR_RE.test(message) ? "transient" : "technical";
}

/**
 * Il motivo, come va scritto accanto a un fallimento.
 *
 * "Temporaneo" è una previsione, e una previsione ha senso solo dove c'è
 * ancora qualcosa da prevedere:
 *
 *   - su `failed` la riga non è rivendicata e le passate successive la
 *     riprenderanno: dire "passeggero" anticipa davvero come andrà a finire;
 *   - su `claimed_not_delivered` il promemoria è perso comunque — la riga
 *     risulta già inviata e nessuno la ritenterà. Chiamare "temporaneo" il
 *     guasto contraddirebbe la frase che gli sta di fianco, che dice l'esatto
 *     contrario. Lì il qualificatore sparisce.
 *
 * Il messaggio grezzo non entra mai qui: vive nel `title`.
 */
export function reminderFailureReason(
    state: ReminderState,
    message: string | null
): string {
    if (state === "claimed_not_delivered") return "problema tecnico";
    return reminderErrorKind(message) === "transient"
        ? "problema tecnico temporaneo"
        : "errore tecnico";
}

export interface ReminderStatusInput {
    status: ReservationStatus;
    /** "YYYY-MM-DD". */
    reservation_date: string;
    reminder_sent_at: string | null;
    reminder_failed_at: string | null;
}

export interface ReminderStatusOptions {
    /**
     * `activities.reservation_reminder_enabled` della sede. `undefined` =
     * ignoto (sede non ancora caricata): si assume acceso, perché dichiarare
     * "non previsto" senza saperlo è peggio che tacere.
     */
    reminderEnabled?: boolean;
    now?: Date;
}

/**
 * Momento oltre il quale nessuna passata partirà più per questa prenotazione:
 * le 20:00 della sera prima. Wall-clock locale, coerente con come sono salvate
 * data e ora (nessuna aritmetica di fuso).
 *
 * Ritorna `null` se la data non è interpretabile: chi chiama tratta il caso
 * come "finestra non passata", cioè non accusa nessuno sulla base di un dato
 * che non sa leggere.
 */
export function lastReminderOpportunity(isoDate: string): Date | null {
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    if (!y || !m || !d) return null;
    const eveningBefore = new Date(y, m - 1, d, LAST_REMINDER_HOUR, 0, 0, 0);
    eveningBefore.setDate(eveningBefore.getDate() - 1);
    return eveningBefore;
}

/**
 * Se la riga del promemoria va mostrata affatto.
 *
 * Su `seated` e `completed` no: il cliente è (o è stato) nel locale, e il
 * promemoria della sera prima non è "non previsto" — è una domanda che non
 * esiste più. Dire qualsiasi cosa, anche "inviato", commenterebbe un
 * passato che non interessa più a nessuno in sala.
 */
export function showReminderStatus(status: ReservationStatus): boolean {
    return status !== "seated" && status !== "completed";
}

export function reminderState(
    reservation: ReminderStatusInput,
    options: ReminderStatusOptions = {}
): ReminderState {
    const { reminderEnabled, now = new Date() } = options;

    const sent = Boolean(reservation.reminder_sent_at);
    const failed = Boolean(reservation.reminder_failed_at);

    // L'ordine conta: la coppia "entrambi valorizzati" deve essere riconosciuta
    // prima di "inviato", altrimenti la perdita sparisce dentro il successo.
    if (sent && failed) return "claimed_not_delivered";
    if (sent) return "sent";
    if (failed) return "failed";

    // Da qui in giù non è mai stato tentato nulla. I tre motivi restano
    // distinti perché portano a gesti diversi: il primo si cambia in
    // impostazioni sede, il secondo confermando la prenotazione, il terzo non
    // si cambia affatto.
    if (reminderEnabled === false) return "not_planned_venue";
    if (reservation.status !== "confirmed") return "not_planned_status";

    const deadline = lastReminderOpportunity(reservation.reservation_date);
    if (deadline && now.getTime() >= deadline.getTime()) return "not_planned_past";

    return "pending";
}
