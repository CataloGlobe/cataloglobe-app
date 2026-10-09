// Formattazioni condivise fra l'elenco e la scheda del cliente.
//
// File separato dai componenti perché entrambe le viste devono mostrare la
// stessa data nello stesso formato: due copie divergerebbero alla prima
// modifica ("12 mar 2026" in una vista e "12/03/2026" nell'altra sulla stessa
// riga di dati è il tipo di incoerenza che fa dubitare del dato, non del
// formato).

import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * «+39 333 000 0051»: il telefono a gruppi, solo per leggerlo (T15). Il dato
 * resta E.164; un valore che non si interpreta si mostra com'è.
 */
export function formatPhoneForDisplay(e164: string | null | undefined): string {
    if (!e164) return "";
    return parsePhoneNumberFromString(e164)?.formatInternational() ?? e164;
}

/**
 * Iniziale per il cerchio a sinistra della riga.
 *
 * Il nome lo scrive il trigger e non è mai vuoto, ma può essere un numero di
 * telefono quando la prenotazione non aveva un nome: in quel caso l'iniziale è
 * una cifra, comunque meglio di un cerchio vuoto.
 */
export function guestInitial(displayName: string): string {
    const first = displayName.trim().charAt(0);
    return first ? first.toUpperCase() : "?";
}

/**
 * «20 set» nell'anno in corso, «12 mar 2025» prima (Clienti A, D154);
 * "—" quando non c'è nessuna visita visibile.
 */
export function formatShortVisitDate(isoDate: string | null, today: Date): string {
    if (!isoDate) return "—";
    const [y, m, d] = isoDate.split("-").map(n => parseInt(n, 10));
    if (!y || !m || !d) return "—";
    return new Intl.DateTimeFormat("it-IT", {
        day: "numeric",
        month: "short",
        ...(y === today.getFullYear() ? {} : { year: "numeric" })
    }).format(new Date(y, m - 1, d));
}
