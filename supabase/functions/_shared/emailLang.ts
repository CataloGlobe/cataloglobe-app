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
 * Forma ammessa per il valore in ARRIVO dal client, prima di scriverlo su
 * `reservations.customer_language`: un tag lingua con eventuali sottotag
 * (`de`, `de-DE`, `pt-BR`, `zh-Hans-CN`), separatore `-` o `_`.
 *
 * Volutamente PIU' LARGA delle cinque lingue che sappiamo scrivere: qui si
 * decide cosa e' un tag lingua plausibile, non cosa sappiamo tradurre. Chi
 * decide la seconda cosa e' `resolveEmailLang`, al momento di comporre
 * l'email.
 */
const LANGUAGE_TAG_RE = /^[a-z]{2,5}(?:[-_][a-z0-9]{2,8}){0,2}$/i;

/**
 * Valida il valore grezzo che arriva dal client e lo restituisce COSI' COM'E'
 * (solo `trim`), oppure `null` se non e' un tag lingua plausibile.
 *
 * ── Perche' accetta anche le forme con regione ──────────────────────────────
 * Prima questa regola era `/^[a-z]{2,5}$/` e viveva dentro `submit-reservation`,
 * mentre `resolveEmailLang` sapeva gia' ridurre `de-AT` a `de`. Le due regole
 * non concordavano: un `de-DE` sarebbe stato scartato in scrittura e la colonna
 * sarebbe rimasta NULL, cioe' il silenzio piu' difficile da inseguire — nessun
 * errore, nessun log, solo un'email in italiano. Oggi la lingua arriva dal
 * segmento URL (`de`) e il caso non si presenta; il giorno che arrivasse da
 * `i18n.language` o da un header `Accept-Language`, si presenterebbe.
 *
 * ── Perche' NON normalizza ──────────────────────────────────────────────────
 * `de-DE` resta `de-DE` nella colonna. Ridurre a lingua base e' una decisione
 * di PRESENTAZIONE (la prende `resolveEmailLang`, che scrive l'email in
 * tedesco in entrambi i casi), non di archiviazione. Il giorno che servisse
 * distinguere un austriaco da un tedesco, il dato c'e' ancora.
 */
export function normalizeCustomerLanguageInput(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    return LANGUAGE_TAG_RE.test(trimmed) ? trimmed : null;
}

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
