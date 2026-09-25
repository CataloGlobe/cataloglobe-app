/**
 * UUID v4 che funziona anche fuori da un contesto sicuro.
 *
 * `crypto.randomUUID` esiste solo in https o su localhost (e da iOS 15.4):
 * da `http://<ip-di-rete>` o su iOS vecchi manca, e chiamarlo lancia
 * `TypeError`. Ordine: randomUUID → getRandomValues (disponibile anche in
 * http) → Date.now + Math.random, sempre in forma UUID v4 perché i consumer
 * lato server validano il formato (es. `log-analytics-event`).
 * L'ultimo ripiego non è crittografico: va bene per id di sessione, non per segreti.
 */
export function randomUuid(): string {
    const c: Crypto | undefined = typeof globalThis.crypto === "undefined" ? undefined : globalThis.crypto;

    if (c && typeof c.randomUUID === "function") {
        return c.randomUUID();
    }

    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") {
        c.getRandomValues(bytes);
    } else {
        let seed = Date.now();
        for (let i = 0; i < bytes.length; i++) {
            // Mescola l'orologio con Math.random: due chiamate nello stesso ms restano diverse.
            bytes[i] = (Math.floor(Math.random() * 256) ^ seed) & 0xff;
            seed = Math.floor(seed / 256) || Date.now();
        }
    }

    // RFC 4122 §4.4: versione 4, variante 10xx.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
