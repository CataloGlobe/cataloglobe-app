// Decisioni pure di retry per menu-ai-import. ZERO import Deno (solo logica)
// → node-testabile via Vitest, come geminiFailure.ts / aiImportPayloadSize.ts.
// Il loop (fetch + sleep) vive in index.ts ma DELEGA qui ogni decisione.

import type { GeminiFailureCode } from "./geminiFailure.ts";

export const MAX_ATTEMPTS = 3; // ≤ 2 retry: limita il wall-clock dell'edge
export const BASE_BACKOFF_SECONDS = 1;
export const MAX_BACKOFF_SECONDS = 6;

// Ritentabili SOLO le cause transitorie. MAI rate_limit_rpd (muro giornaliero,
// non si sblocca fino a mezzanotte PT → ritentare è inutile e dannoso), né le
// cause deterministiche (content_blocked, max_tokens, bad_response), né il
// rate_limit generico (conservativo: potrebbe mascherare un RPD).
export const RETRYABLE_CODES: ReadonlySet<GeminiFailureCode> = new Set([
    "upstream_unavailable",
    "rate_limit_rpm_tpm"
]);

export function isRetryable(code: GeminiFailureCode): boolean {
    return RETRYABLE_CODES.has(code);
}

/**
 * Secondi da attendere prima del prossimo tentativo, oppure `null` se non si
 * deve ritentare (delay richiesto oltre il cap → meglio restituire l'errore
 * che tenere aperto l'edge).
 * @param attempt 1-indexed: numero del tentativo appena fallito.
 */
export function computeBackoffSeconds(attempt: number, retryAfterSeconds?: number): number | null {
    if (retryAfterSeconds !== undefined && retryAfterSeconds > MAX_BACKOFF_SECONDS) {
        return null;
    }
    const exponential = BASE_BACKOFF_SECONDS * 2 ** (attempt - 1);
    const desired = retryAfterSeconds ?? exponential;
    return Math.min(desired, MAX_BACKOFF_SECONDS);
}
