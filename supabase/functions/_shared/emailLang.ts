// Le lingue in cui sappiamo scrivere a un cliente, e la regola per arrivarci
// da un valore grezzo.
//
// Vive in un modulo a se' perche' ha due consumatori che non devono conoscersi:
// il dizionario delle email prenotazione (`reservationEmailCopy.ts`) e il
// footer legale condiviso da tutte le email (`company-config.ts`). Tenere la
// definizione in uno dei due significherebbe farla importare dall'altro, e il
// footer non ha niente a che vedere con le prenotazioni.

/** Le lingue della pagina pubblica, che sono anche quelle delle email. */
export const EMAIL_LANGS = ["it", "en", "fr", "de", "es"] as const;

export type EmailLang = (typeof EMAIL_LANGS)[number];

/**
 * Lingua di ripiego. Il prodotto e' italiano e la sede e' italiana: quando non
 * sappiamo in che lingua scrivere, l'italiano e' la risposta meno sbagliata.
 */
export const DEFAULT_EMAIL_LANG: EmailLang = "it";

/**
 * Riconduce un valore grezzo (tipicamente `reservations.customer_language`) a
 * una lingua che sappiamo scrivere.
 *
 * NULL (prenotazione presa a mano, o riga anteriore alla colonna), stringa
 * vuota, spazi, una lingua che non copriamo ancora ('pt'), o un valore senza
 * senso ('xx'): tutto finisce in italiano, senza mai lanciare. La colonna resta
 * com'e' — registra la scelta del cliente, non la copertura delle nostre
 * traduzioni.
 */
export function resolveEmailLang(raw: string | null | undefined): EmailLang {
    if (typeof raw !== "string") return DEFAULT_EMAIL_LANG;
    // "DE", " de ", "de-AT" → "de". Il suffisso regionale non cambia la lingua
    // in cui e' scritta l'email.
    const base = raw.trim().toLowerCase().split(/[-_]/)[0];
    return (EMAIL_LANGS as readonly string[]).includes(base)
        ? (base as EmailLang)
        : DEFAULT_EMAIL_LANG;
}
