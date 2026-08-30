// Generatore di file iCalendar (.ics) per una prenotazione.
//
// Funzione pura: nessuna rete, nessun ambiente, nessun orologio proprio —
// `now` viene iniettato, cosi' DTSTAMP e' deterministico nei test.
//
// L'allegato serve a chi si dimentica del tutto, e lo raggiunge nel momento in
// cui e' piu' disposto ad agire: subito dopo aver prenotato.
//
// ── METHOD:PUBLISH, e nessun ATTENDEE ───────────────────────────────────────
// NON aggiungere ATTENDEE ne' passare a METHOD:REQUEST "per completezza".
// Con quei due campi Gmail e Outlook smettono di trattare il file come un
// evento da aggiungere e lo trattano come un INVITO A RIUNIONE: compaiono i
// pulsanti Accetta/Rifiuta e la risposta RSVP parte via email verso
// l'organizzatore. Il risultato e' un canale di risposte che nessuno legge e
// un cliente convinto di aver comunicato qualcosa. Un test sul sorgente
// presidia entrambe le cose.
//
// ── UTC, non ora locale ─────────────────────────────────────────────────────
// `reservation_date` + `reservation_time` sono wall-clock italiano. Vengono
// convertiti in un ISTANTE e scritti con la `Z`. Le alternative sbagliano:
//   - "floating" (senza suffisso) mostra 20:00 in qualunque fuso, quindi chi
//     prenota a Milano e apre il calendario atterrato a Londra arriva un'ora
//     tardi;
//   - TZID richiede di spedire il blocco VTIMEZONE con le regole DST, piu'
//     codice e piu' cose che possono rompersi.
// La conversione usa `wallClockToInstant`, gia' coperta da test sui due cambi
// d'ora. (Debito di nome noto: quella funzione ormai serve tre chiamanti e
// vive ancora in `reservationCancellation.ts`.)
//
// ── Regole di formato rispettate ────────────────────────────────────────────
//   - CRLF su ogni riga, terminatore finale compreso;
//   - piegatura a 75 OTTETTI (non caratteri): si contano i byte UTF-8 e la
//     continuazione inizia con uno spazio singolo;
//   - escaping TEXT: `\` `;` `,` e a capo. I due punti NON si escapano;
//   - campi obbligatori: VERSION, PRODID, e nel VEVENT UID, DTSTAMP, DTSTART.

// ── Lingua ──────────────────────────────────────────────────────────────────
// Le stringhe NOSTRE del file (SUMMARY, la descrizione, il nome dell'allegato)
// seguono la lingua della prenotazione, come le email. I DATI no: nome della
// sede, indirizzo e link restano quello che sono. `null`, lingua ignota o
// lingua che non copriamo → italiano, esattamente come nelle email.

import { wallClockToInstant } from "./reservationCancellation.ts";
import { reservationCopyFor } from "./reservationEmailCopy.ts";

/**
 * Dominio dell'UID. NON cambiarlo: l'UID identifica l'evento nel calendario
 * del cliente, e un valore diverso farebbe comparire un secondo appuntamento
 * accanto al primo invece di aggiornarlo.
 */
const UID_DOMAIN = "cataloglobe.com";

const PRODID = "-//CataloGlobe//Prenotazioni//IT";

/** Fallback quando la sede non ha una durata valida configurata. */
const DEFAULT_DURATION_MINUTES = 120;

/** Componenti dell'indirizzo, cosi' come stanno su `activities`. */
export interface ReservationIcsAddress {
    address?: string | null;
    street_number?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
}

export interface ReservationIcsInput {
    /** UUID della prenotazione: e' la sorgente dell'UID stabile. */
    reservationId: string;
    venueName: string;
    /** `YYYY-MM-DD`, wall-clock della sede. */
    reservationDate: string;
    /** `HH:MM` o `HH:MM:SS`, wall-clock della sede. */
    reservationTime: string;
    partySize: number;
    /** `activities.reservation_duration_minutes`. Valori non validi → 120. */
    durationMinutes?: number | null;
    /** Componenti dell'indirizzo. Tutte opzionali: vedi `formatVenueAddress`. */
    address?: ReservationIcsAddress | null;
    /** Link di disdetta, finisce nella descrizione. Opzionale. */
    cancelUrl?: string | null;
    /**
     * Valore grezzo di `reservations.customer_language`. Decide la lingua delle
     * stringhe nostre; assente o non supportata → italiano. Non fallisce mai.
     */
    language?: string | null;
    /** Istante di generazione, per DTSTAMP. Iniettato per i test. */
    now: Date;
}

/**
 * Indirizzo leggibile, nella forma gia' usata dal progetto
 * (`_shared/company-config.ts`): `Via Verdi, 30, 20092 Cinisello Balsamo (MI)`.
 *
 * Ogni pezzo e' opzionale e i pezzi mancanti spariscono senza lasciare virgole
 * orfane. Con nulla di utilizzabile ritorna null, e il chiamante ricade sul
 * solo nome della sede — mai un fallimento, mai un indirizzo mutilato.
 */
export function formatVenueAddress(address: ReservationIcsAddress | null | undefined): string | null {
    if (!address) return null;

    const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

    const street = clean(address.address);
    const streetNumber = clean(address.street_number);
    const postalCode = clean(address.postal_code);
    const city = clean(address.city);
    const province = clean(address.province);

    // "Via Verdi" + "30" → "Via Verdi, 30". Un civico senza via non dice nulla
    // di utile, quindi viene scartato.
    const streetPart = street.length > 0
        ? (streetNumber.length > 0 ? `${street}, ${streetNumber}` : street)
        : "";

    // "20092 Cinisello Balsamo (MI)". Il CAP da solo non serve a nessuno; la
    // provincia da sola nemmeno.
    const cityPart = city.length > 0
        ? [postalCode, city].filter(p => p.length > 0).join(" ") +
          (province.length > 0 ? ` (${province})` : "")
        : "";

    const parts = [streetPart, cityPart].filter(p => p.length > 0);
    return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * UID dell'evento. Stabile per prenotazione: la conferma e il promemoria sono
 * due edge function diverse ma producono lo STESSO valore, quindi il secondo
 * file aggiorna l'evento gia' in calendario invece di affiancargliene un altro.
 */
export function buildReservationIcsUid(reservationId: string): string {
    return `reservation-${reservationId.trim().toLowerCase()}@${UID_DOMAIN}`;
}

/** Escaping dei valori TEXT (RFC 5545 §3.3.11). L'ordine conta: prima le barre. */
function escapeText(value: string): string {
    return value
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n/g, "\\n")
        .replace(/[\r\n]/g, "\\n");
}

/**
 * Piegatura a 75 ottetti (RFC 5545 §3.1).
 *
 * Si contano i BYTE UTF-8, non i caratteri: con nomi accentati o emoji la
 * differenza e' reale, e una riga troppo lunga fa rifiutare il file. La
 * continuazione inizia con uno spazio singolo, e un carattere multi-byte non
 * viene mai spezzato a meta'.
 */
function foldLine(line: string): string {
    const encoder = new TextEncoder();
    if (encoder.encode(line).length <= 75) return line;

    const out: string[] = [];
    let current = "";
    let currentBytes = 0;
    // Primo segmento 75 ottetti, i successivi 74: lo spazio iniziale della
    // continuazione occupa un ottetto della riga.
    let limit = 75;

    for (const char of line) {
        const charBytes = encoder.encode(char).length;
        if (currentBytes + charBytes > limit) {
            out.push(current);
            current = char;
            currentBytes = charBytes;
            limit = 74;
        } else {
            current += char;
            currentBytes += charBytes;
        }
    }
    if (current.length > 0) out.push(current);

    return out.join("\r\n ");
}

/** `YYYYMMDDTHHMMSSZ` — forma UTC dei timestamp iCalendar. */
function toIcsUtc(instant: Date): string {
    const p = (n: number, len = 2) => String(n).padStart(len, "0");
    return (
        `${p(instant.getUTCFullYear(), 4)}${p(instant.getUTCMonth() + 1)}${p(instant.getUTCDate())}` +
        `T${p(instant.getUTCHours())}${p(instant.getUTCMinutes())}${p(instant.getUTCSeconds())}Z`
    );
}

function normalizeDuration(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_DURATION_MINUTES;
    const minutes = Math.trunc(value);
    // Stesso intervallo del campo in impostazioni sede (15–600).
    if (minutes < 15 || minutes > 600) return DEFAULT_DURATION_MINUTES;
    return minutes;
}

/**
 * Costruisce il file .ics di una prenotazione.
 *
 * Ritorna null quando data e ora non sono interpretabili: il chiamante manda
 * l'email senza allegato. Un allegato mancante e' un fastidio, una conferma
 * non recapitata e' un danno — questa funzione non lancia mai.
 */
export function buildReservationIcs(input: ReservationIcsInput): string | null {
    const {
        reservationId,
        venueName,
        reservationDate,
        reservationTime,
        partySize,
        durationMinutes,
        address,
        cancelUrl,
        language,
        now
    } = input;

    const copy = reservationCopyFor(language);

    if (typeof reservationId !== "string" || reservationId.trim().length === 0) return null;
    if (typeof venueName !== "string" || venueName.trim().length === 0) return null;

    const start = wallClockToInstant(reservationDate, reservationTime);
    if (start === null) return null;
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) return null;

    const minutes = normalizeDuration(durationMinutes);
    // Una cena alle 23:30 finisce il giorno dopo: e' aritmetica sull'istante,
    // quindi il passaggio di data (e di mese, e di anno) viene da se'.
    const end = new Date(start.getTime() + minutes * 60000);

    const formattedAddress = formatVenueAddress(address);
    // LOCATION: indirizzo completo quando c'e', altrimenti il solo nome della
    // sede. Mai una stringa vuota, mai un indirizzo a pezzi.
    const location = formattedAddress
        ? `${venueName.trim()}, ${formattedAddress}`
        : venueName.trim();

    const peopleLine =
        Number.isInteger(partySize) && partySize >= 1 ? copy.icsPeople(partySize) : null;
    const descriptionParts = [
        peopleLine,
        typeof cancelUrl === "string" && cancelUrl.trim().length > 0
            ? copy.icsCancelLine(cancelUrl.trim())
            : null
    ].filter((p): p is string => p !== null);

    const lines: string[] = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:${PRODID}`,
        "CALSCALE:GREGORIAN",
        // PUBLISH e non REQUEST: evento da aggiungere, non invito con RSVP.
        // Vedi l'intestazione del file prima di toccare questa riga.
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        `UID:${buildReservationIcsUid(reservationId)}`,
        `DTSTAMP:${toIcsUtc(now)}`,
        `DTSTART:${toIcsUtc(start)}`,
        `DTEND:${toIcsUtc(end)}`,
        `SUMMARY:${escapeText(copy.icsSummary(venueName.trim()))}`,
        `LOCATION:${escapeText(location)}`
    ];

    if (descriptionParts.length > 0) {
        lines.push(`DESCRIPTION:${escapeText(descriptionParts.join("\n"))}`);
    }

    lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");

    // CRLF ovunque, terminatore finale compreso.
    return lines.map(foldLine).join("\r\n") + "\r\n";
}

/**
 * Base64 del file, pronto per il campo `content` di Resend.
 *
 * Passa per TextEncoder e non per `btoa` diretto: `btoa` lancia su qualunque
 * carattere fuori da Latin-1, e i nomi delle sedi sono pieni di accenti.
 */
export function reservationIcsToBase64(ics: string): string {
    const bytes = new TextEncoder().encode(ics);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

/**
 * Nome del file allegato in italiano.
 *
 * Il nome segue la lingua della prenotazione (`copy.icsFilename`): e' la prima
 * cosa che il cliente legge dell'allegato, e "prenotazione.ics" in fondo a
 * un'email tedesca stona quanto una frase non tradotta. Questa costante resta
 * come valore italiano di riferimento per i chiamanti che non hanno una lingua.
 */
export const RESERVATION_ICS_FILENAME = "prenotazione.ics";

export interface ResendAttachment {
    filename: string;
    /** Contenuto base64, come vuole Resend. */
    content: string;
}

/**
 * Allegato pronto per `resend.emails.send`, oppure `undefined`.
 *
 * Unico punto di contatto fra il generatore e le email, ed e' deliberatamente
 * a prova di tutto: qualunque cosa vada storta — dati incompleti, una data che
 * non si lascia interpretare, un guasto imprevisto — ritorna `undefined` e
 * l'email parte senza allegato. Un promemoria senza .ics e' un fastidio, una
 * conferma non recapitata e' un danno.
 *
 * I chiamanti fanno `...(attachments ? { attachments } : {})`: con `undefined`
 * il campo non compare nemmeno nella richiesta.
 */
export function buildReservationIcsAttachment(
    input: ReservationIcsInput
): ResendAttachment[] | undefined {
    try {
        const ics = buildReservationIcs(input);
        if (ics === null) return undefined;
        const filename = reservationCopyFor(input.language).icsFilename;
        return [{ filename, content: reservationIcsToBase64(ics) }];
    } catch (err) {
        console.error(
            "[reservationIcs] attachment build failed:",
            err instanceof Error ? err.message : "unknown error"
        );
        return undefined;
    }
}
