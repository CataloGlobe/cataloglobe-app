/**
 * Impronta di un telefono E.164: sha256 esadecimale del testo UTF-8.
 *
 * ⚠️ SYNC con `public.crm_phone_fingerprint` (migration 20261001120100): stessa
 * formula, così le impronte scritte dal browser e dal database si confrontano.
 * Pseudonimizzazione, non anonimizzazione: serve a non tenere il numero in
 * chiaro dove basta riconoscerlo (chiavi dei lead Meta senza id).
 */
export async function phoneFingerprint(phoneE164: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(phoneE164));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
