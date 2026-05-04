/**
 * Hash canonical-form per il sistema traduzioni.
 *
 * Le funzioni qui sono pure (niente import da Supabase) e ASYNC perché
 * `crypto.subtle.digest` ritorna Promise. I caller (translationJobs.ts) devono
 * fare `await`.
 *
 * Coerenza: il pattern canonical form deve combaciare con quello usato dalle
 * migration di backfill SQL (Prompt 3 / 3b) — `lower(trim(text))` — altrimenti
 * gli hash divergono e i job di traduzione vengono ri-enqueued falsamente.
 *
 * Sincronizzazione futura: una copia equivalente vive in
 * `supabase/functions/_shared/translation/hashUtils.ts` per Deno (Prompt 7).
 * Mantenere allineate manualmente — pattern noto per scheduleResolver.ts.
 *
 * Ref: docs/translations-architecture-v3.md sez. 6.5, 2.4.
 */

import type { ProductNote } from "@/services/supabase/products";

/**
 * Hash canonical form per campi singoli tradotti (description, name, label,
 * note, ecc.).
 *
 * @returns null se input null/empty/whitespace-only. Il caller usa null come
 *          segnale per cancellare le translations esistenti per quel field
 *          (DELETE invece di INSERT/UPDATE).
 */
export async function computeFieldHash(
    text: string | null | undefined
): Promise<string | null> {
    if (text === null || text === undefined) return null;
    const normalized = text.trim().toLowerCase();
    if (normalized.length === 0) return null;
    return sha256Hex(normalized);
}

/**
 * Hash specifico per `products.notes` JSONB array. Trattamento unitario
 * dell'intero array (NON per-elemento) — vedi sez. 2.4 v3 + Q-CN10.
 *
 * Canonical form: array di {label, value} con trim su ogni stringa, NO sort
 * (l'ordine è semantico nel rendering pubblico).
 *
 * Edge case:
 * - Array `null` o vuoto → ritorna null → caller fa DELETE.
 * - Singola entry tutto-vuoto: hash diverso da null. Lato UI dovrebbe
 *   filtrare prima del save (validateProductNotes lo fa già).
 *
 * @returns null se array null/vuoto. Hex string altrimenti.
 */
export async function computeNotesHash(
    notes: ProductNote[] | null | undefined
): Promise<string | null> {
    if (!notes || notes.length === 0) return null;
    const canonical = JSON.stringify(
        notes.map(n => ({
            label: (n.label ?? "").trim(),
            value: (n.value ?? "").trim()
        }))
    );
    return sha256Hex(canonical);
}

/**
 * Helper interno: SHA-256 → hex string via Web Crypto API.
 *
 * `crypto.subtle` è disponibile sia nel browser che in Node.js >= 16
 * (globalThis.crypto). Non serve import esplicito.
 */
async function sha256Hex(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(input);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}
