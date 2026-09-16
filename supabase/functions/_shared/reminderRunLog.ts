// =============================================================================
// Riepilogo di una passata del promemoria, nella forma che va in
// `reservation_reminder_runs`
// =============================================================================
//
// La tabella e' uno strumento di piattaforma: risponde a "il promemoria ha
// funzionato stasera?", che le colonne su `reservations` non possono risolvere.
// Un giro con zero candidati e un giro mai partito sono indistinguibili
// guardando solo le prenotazioni, e sono due guasti diversi.
//
// ── Mai dati personali qui dentro ───────────────────────────────────────────
// `errors` porta `reservation_id` e messaggio. MAI indirizzi email, MAI numeri
// di telefono, MAI nomi. Non e' un timore astratto: i messaggi arrivano da
// Resend e da PostgREST, che l'indirizzo del destinatario lo conoscono e a
// volte lo ripetono nell'errore. Per questo la redazione e' applicata QUI, a
// valle di tutto, invece di fidarsi di chi compone il messaggio.
//
// Il `reservation_id` basta a risalire al resto passando da `reservations`,
// dove i permessi ci sono.
//
// ── Tetti ───────────────────────────────────────────────────────────────────
// Un giro andato storto per intero non deve poter gonfiare una riga fino a
// diventare un problema suo. Si tronca, e la troncatura si dichiara dentro il
// jsonb: una lista tagliata in silenzio si legge come "sono stati solo venti".
// =============================================================================

/** Errori conservati per passata. Oltre, si tronca e lo si dice. */
export const MAX_LOGGED_ERRORS = 20;

/** Tetto per singolo messaggio. */
export const MAX_ERROR_MESSAGE_CHARS = 300;

/** Tetto sui motivi di scarto: la mappa e' a chiavi fisse, questo e' un argine. */
export const MAX_SKIPPED_KEYS = 30;

const EMAIL_RE = /[^\s<>()[\]",;:@]+@[^\s<>()[\]",;:@]+\.[A-Za-z]{2,}/g;

// Sequenze che potrebbero essere un numero di telefono. Larga di proposito: e'
// meglio redigere un numero che non lo era che lasciarne passare uno che lo era.
const PHONE_LIKE_RE = /\+?\d[\d\s().\-/]{6,}\d/g;

// Data o timestamp ISO: comincia con quattro cifre e due trattini. Ha la forma
// di un telefono per la regex sopra, ma e' l'informazione piu' utile che un
// messaggio di errore possa contenere, e va lasciata stare.
const ISO_DATE_PREFIX_RE = /^\d{4}-\d{2}-\d{2}/;

/**
 * Toglie da un messaggio tutto cio' che identifica una persona.
 *
 * Le email si redigono per prime: la regex dei telefoni, applicata su un
 * indirizzo, ne mangerebbe solo i numeri lasciando in chiaro il resto.
 */
export function redactPersonalData(message: string): string {
    return message
        .replace(EMAIL_RE, "[email]")
        .replace(PHONE_LIKE_RE, match => {
            const digits = match.replace(/\D/g, "");
            if (digits.length < 8) return match;
            if (ISO_DATE_PREFIX_RE.test(match.trim())) return match;
            return "[telefono]";
        });
}

/** Redige e tronca: la forma in cui un messaggio puo' essere conservato. */
export function safeErrorMessage(message: string): string {
    const redacted = redactPersonalData(message);
    return redacted.length > MAX_ERROR_MESSAGE_CHARS
        ? `${redacted.slice(0, MAX_ERROR_MESSAGE_CHARS - 1)}…`
        : redacted;
}

export interface RunErrorEntry {
    /** `null` per gli avvisi che riguardano il giro, non una prenotazione. */
    reservation_id: string | null;
    message: string;
}

export interface RunSummary {
    candidates: number;
    sent: number;
    failed: number;
    skipped: Record<string, number>;
    errors: RunErrorEntry[];
}

export interface RunSummaryInput {
    candidates: number;
    sent: number;
    failed: number;
    /** Scarti per motivo: `{ subscription: 2, no_email: 1, ... }`. */
    skipped: Record<string, number>;
    errors: RunErrorEntry[];
    /** Avvisi sul giro nel suo insieme, es. il tetto per passata raggiunto. */
    notes?: string[];
}

function normalizeCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.floor(value)
        : 0;
}

/**
 * Costruisce il riepilogo scritto a fine passata.
 *
 * Gli avvisi di giro stanno in testa e non vengono mai spinti fuori dalla
 * troncatura: "ho raggiunto il tetto e alcune prenotazioni non sono state
 * trattate" e' piu' importante del ventunesimo errore di rete.
 */
export function buildRunSummary(input: RunSummaryInput): RunSummary {
    const noteEntries: RunErrorEntry[] = (input.notes ?? []).map(note => ({
        reservation_id: null,
        message: safeErrorMessage(note)
    }));

    const errorEntries: RunErrorEntry[] = input.errors.map(entry => ({
        reservation_id: entry.reservation_id,
        message: safeErrorMessage(entry.message)
    }));

    const combined = [...noteEntries, ...errorEntries];
    const errors = combined.slice(0, MAX_LOGGED_ERRORS);
    const dropped = combined.length - errors.length;
    if (dropped > 0) {
        errors.push({
            reservation_id: null,
            message: `Altri ${dropped} errori non registrati: raggiunto il tetto di ${MAX_LOGGED_ERRORS} per passata.`
        });
    }

    const skipped: Record<string, number> = {};
    let skippedDropped = 0;
    for (const [key, value] of Object.entries(input.skipped ?? {})) {
        if (Object.keys(skipped).length >= MAX_SKIPPED_KEYS) {
            skippedDropped++;
            continue;
        }
        skipped[key] = normalizeCount(value);
    }
    if (skippedDropped > 0) {
        skipped._truncated = skippedDropped;
    }

    return {
        candidates: normalizeCount(input.candidates),
        sent: normalizeCount(input.sent),
        failed: normalizeCount(input.failed),
        skipped,
        errors
    };
}
