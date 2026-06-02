/**
 * Device fingerprint per il flusso customer QR-ordering.
 *
 * Random UUID v4 generato UNA volta al primo accesso e persistito in
 * `localStorage` (sopravvive a refresh, multi-tab e chiusure del browser
 * finché l'utente non pulisce i dati del sito). Inviato come `device_id`
 * a `resolve-table` per consentire all'Edge Function di riconoscere lo
 * stesso device e riusare la `customer_session` attiva invece di crearne
 * una nuova ad ogni invocazione.
 *
 * Sicurezza:
 *   - device_id NON e' un secret e NON conferisce autorizzazione cross-
 *     tenant. Il match server-side richiede SEMPRE `tenant_id`, derivato
 *     dal tavolo risolto (qr_token → tables row → tenant_id), mai dal
 *     client.
 *   - device_id NON e' un fingerprint del browser: e' un random UUID
 *     opaco, no PII, no canvas/audio/font tracking. L'utente puo'
 *     resettarlo svuotando localStorage.
 *
 * Storage chiave: `cataloglobe-device-id` (singolo valore globale, non
 * per activity — il device e' uno solo a prescindere dal locale che sta
 * visitando).
 */

const DEVICE_ID_KEY = "cataloglobe-device-id";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Genera un UUID v4 usando `crypto.randomUUID()` se disponibile (tutti i
 * browser moderni), fallback su `crypto.getRandomValues` per ambienti
 * piu' restrittivi (es. WebView vecchie). NON usa `Math.random()` —
 * non crittograficamente sicuro.
 */
function generateUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // Fallback RFC 4122 v4 via getRandomValues.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
    return (
        `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
        `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    );
}

/**
 * Restituisce il `device_id` corrente del browser, generandolo se assente.
 * Side effect: scrive in localStorage al primo accesso.
 *
 * Defensive: se localStorage non e' accessibile (modalita' privata strict,
 * cookie disabilitati, SSR), ritorna un UUID volatile non persistito —
 * idempotency degraderà alla sessione corrente del processo, ma la chiamata
 * non fallisce.
 */
export function getOrCreateDeviceId(): string {
    if (typeof window === "undefined") {
        return generateUuid();
    }
    try {
        const existing = window.localStorage.getItem(DEVICE_ID_KEY);
        if (existing && UUID_RE.test(existing)) {
            return existing;
        }
        const fresh = generateUuid();
        window.localStorage.setItem(DEVICE_ID_KEY, fresh);
        return fresh;
    } catch {
        return generateUuid();
    }
}
