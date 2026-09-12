// =============================================================================
// Rivendicazione del promemoria, con ritentativo
// =============================================================================
//
// Il 09/09 il claim atomico di `send-reservation-reminders` ha ricevuto un
// `504 Gateway Timeout` dal gateway PostgREST. Il codice ha contato la riga come
// fallita ed e' passato oltre: il cron gira una volta al giorno, e quel
// promemoria e' andato perso per sempre.
//
// ── Perche' ritentare e' sicuro ─────────────────────────────────────────────
// Il claim e'
//
//     UPDATE reservations SET reminder_sent_at = now()
//     WHERE id = ... AND reminder_sent_at IS NULL RETURNING id
//
// ed e' IDEMPOTENTE. Se il PATCH andato in timeout fosse in realta' arrivato a
// destinazione, un secondo tentativo troverebbe `reminder_sent_at` valorizzato e
// non rivendicherebbe nulla (zero righe). Se non fosse arrivato, rivendica e si
// manda. In nessuno dei due casi si puo' inviare due volte.
//
// E' una proprieta' che la migration del 29/08 aveva gia' costruito e che
// nessuno stava sfruttando.
//
// ── Zero righe NON e' un errore ─────────────────────────────────────────────
// E' il caso piu' facile da sbagliare, ed e' anche il piu' pericoloso: trattare
// "zero righe" come un fallimento da ritentare, o peggio come un successo da cui
// procedere all'invio, trasformerebbe questa correzione in un doppio invio.
// Zero righe significa che la riga e' gia' rivendicata — dal tentativo
// precedente andato in timeout, o da un'altra passata — e si salta in silenzio.
//
// ── Cosa si ritenta ─────────────────────────────────────────────────────────
// Solo il trasporto: timeout, 5xx, cadute di rete. Un errore applicativo
// (permesso negato, colonna inesistente, payload malformato) non e' transitorio:
// ritentarlo tre volte e' solo tempo perso e tre righe di log invece di una.
// Il default e' NON ritentare: davanti a un errore che non riconosciamo, la
// scelta prudente e' fallire subito e lasciarne traccia in
// `reminder_last_error`, non insistere alla cieca.
// =============================================================================

/**
 * Attese fra un tentativo e il successivo. Due valori = tre tentativi in tutto.
 *
 * Volutamente brevi: la passata ha un tetto di tempo e ogni riga aspetta in
 * serie. 200ms + 600ms coprono l'intoppo momentaneo del gateway senza che una
 * sede con cento promemoria paghi un minuto di attese.
 */
export const CLAIM_RETRY_DELAYS_MS: readonly number[] = [200, 600];

/** Tentativi totali: il primo piu' uno per ogni attesa. */
export const CLAIM_MAX_ATTEMPTS = CLAIM_RETRY_DELAYS_MS.length + 1;

/** Tetto al messaggio conservato: un errore verboso non deve gonfiare la riga. */
export const MAX_CLAIM_ERROR_CHARS = 300;

// SQLSTATE che descrivono una condizione passeggera del database, non un difetto
// della richiesta: annullamento per statement_timeout, conflitti di
// serializzazione, deadlock, connessioni cadute, risorse esaurite.
const RETRIABLE_SQLSTATES = new Set([
    "08000", // connection_exception
    "08003", // connection_does_not_exist
    "08006", // connection_failure
    "08P01", // protocol_violation
    "40001", // serialization_failure
    "40P01", // deadlock_detected
    "53300", // too_many_connections
    "55P03", // lock_not_available
    "57014" // query_canceled (statement_timeout)
]);

// Il 504 del 09/09 e' arrivato come `{ message: "Gateway Timeout" }`, senza
// `code` e senza `status`: la classificazione per messaggio non e' un ripiego,
// e' l'unica informazione disponibile in quel caso.
const RETRIABLE_MESSAGE =
    /gateway timeout|bad gateway|service unavailable|timed? ?out|timeout|network|fetch failed|failed to fetch|socket hang up|connection (?:closed|reset|refused|error)|econnreset|econnrefused|etimedout|ehostunreach|enotfound|upstream/i;

/** Messaggio leggibile da qualunque forma di errore, senza mai lanciare. */
export function errorMessageOf(error: unknown): string {
    if (error === null || error === undefined) return "unknown error";
    if (typeof error === "string") return error;
    if (error instanceof Error && error.message) return error.message;
    const record = error as Record<string, unknown>;
    if (typeof record.message === "string" && record.message.length > 0) {
        return record.message;
    }
    if (typeof record.code === "string" && record.code.length > 0) {
        return `error ${record.code}`;
    }
    return "unknown error";
}

/** Tronca il messaggio conservando l'inizio, che e' la parte che dice cosa e'. */
export function truncateClaimError(message: string): string {
    return message.length > MAX_CLAIM_ERROR_CHARS
        ? `${message.slice(0, MAX_CLAIM_ERROR_CHARS - 1)}…`
        : message;
}

/**
 * True se vale la pena ritentare: guasto di trasporto, non difetto della
 * richiesta.
 *
 * L'ordine dei controlli conta. Lo stato HTTP, quando c'e', e' l'informazione
 * piu' affidabile e decide da solo: un 403 il cui messaggio contiene per caso la
 * parola "timeout" resta un 403. Solo in sua assenza si guarda lo SQLSTATE, e
 * solo in assenza di entrambi il messaggio.
 */
export function isRetriableTransportError(error: unknown): boolean {
    if (error === null || error === undefined) return false;

    const record = (typeof error === "object" ? error : {}) as Record<string, unknown>;

    const rawStatus = record.status ?? record.statusCode ?? record.httpStatus;
    const status = typeof rawStatus === "number" ? rawStatus : Number.NaN;
    if (Number.isFinite(status)) {
        // 408 Request Timeout e 429 Too Many Requests sono condizioni di attesa,
        // non richieste sbagliate: la stessa richiesta fra poco puo' riuscire.
        if (status >= 500 || status === 408 || status === 429) return true;
        if (status >= 400) return false;
    }

    const code = typeof record.code === "string" ? record.code : "";
    if (code.length > 0) {
        if (RETRIABLE_SQLSTATES.has(code)) return true;
        // Qualunque altro codice applicativo — SQLSTATE di vincolo violato,
        // `PGRST*` di PostgREST, `42501` di permesso negato — descrive qualcosa
        // che non cambia ritentando.
        return false;
    }

    return RETRIABLE_MESSAGE.test(errorMessageOf(error));
}

/** Esito di una richiesta di rivendicazione, nella forma che ritorna supabase-js. */
export interface ClaimAttemptResult {
    data: unknown;
    error: unknown;
}

export type ClaimOutcome =
    /** Riga rivendicata da noi: e' questo tentativo che deve mandare l'email. */
    | { kind: "claimed"; attempts: number }
    /**
     * Zero righe: gia' rivendicata. NON e' un errore e NON si manda nulla —
     * puo' essere il nostro stesso tentativo precedente andato in timeout ma
     * arrivato a destinazione.
     */
    | { kind: "already_claimed"; attempts: number }
    /** Nessun tentativo e' riuscito. `retriable` dice se abbiamo insistito. */
    | { kind: "failed"; attempts: number; message: string; retriable: boolean };

interface ClaimOptions {
    delaysMs?: readonly number[];
    sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
    new Promise(resolve => setTimeout(resolve, ms));

/**
 * Esegue la rivendicazione ritentando i soli guasti di trasporto.
 *
 * `attempt` viene invocata da capo a ogni giro: deve costruire una richiesta
 * nuova, non riusare un builder gia' consumato.
 */
export async function claimWithRetry(
    attempt: (attemptNumber: number) => Promise<ClaimAttemptResult>,
    options: ClaimOptions = {}
): Promise<ClaimOutcome> {
    const delays = options.delaysMs ?? CLAIM_RETRY_DELAYS_MS;
    const sleep = options.sleep ?? defaultSleep;
    const totalAttempts = delays.length + 1;

    let lastMessage = "unknown error";
    let lastRetriable = false;
    let attemptsMade = 0;

    for (let index = 0; index < totalAttempts; index++) {
        const attemptNumber = index + 1;
        attemptsMade = attemptNumber;

        let result: ClaimAttemptResult;
        try {
            result = await attempt(attemptNumber);
        } catch (thrown) {
            // Una `fetch` che esplode non arriva come `{ error }` ma come
            // eccezione: e' il caso piu' tipico di guasto di rete, e va
            // classificato come tutti gli altri invece di far cadere il giro.
            result = { data: null, error: thrown };
        }

        if (!result.error) {
            return result.data
                ? { kind: "claimed", attempts: attemptNumber }
                : { kind: "already_claimed", attempts: attemptNumber };
        }

        lastMessage = truncateClaimError(errorMessageOf(result.error));
        lastRetriable = isRetriableTransportError(result.error);

        if (!lastRetriable) break;
        if (attemptNumber >= totalAttempts) break;

        await sleep(delays[index]);
    }

    // `attempts` conta i tentativi davvero fatti, non quelli previsti: un errore
    // non ritentabile al secondo giro deve leggersi come due, non come uno.
    return {
        kind: "failed",
        attempts: attemptsMade,
        message: lastMessage,
        retriable: lastRetriable
    };
}
