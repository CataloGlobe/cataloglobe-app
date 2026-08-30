// @ts-nocheck
// ---------------------------------------------------------------------------
// Limiti dei campi testuali dell'API Stripe + clamp difensivo.
//
// I dati fiscali del tenant sono testo libero: una ragione sociale incollata
// male (caso reale: 728 caratteri) fa rifiutare `customers.create` con 400
// `parameter_invalid_string_length`, che l'edge mappa su 502
// `stripe_customer_create_failed` e blocca il checkout.
//
// Il clamp NON aggiunge ellissi: il valore troncato finisce su Stripe come
// pre-fill, mentre la fonte di verita' resta il DB.
// ---------------------------------------------------------------------------

/** Massimo per `customer.name`. */
export const STRIPE_CUSTOMER_NAME_MAX = 256;

/** Massimo per `customer.description`. */
export const STRIPE_CUSTOMER_DESCRIPTION_MAX = 350;

/** Massimo per ogni value di `metadata` (le chiavi hanno un limite separato di 40). */
export const STRIPE_METADATA_VALUE_MAX = 500;

/**
 * Trim + taglio a `max` **code point** (non code unit: `slice` su string
 * spezzerebbe le coppie surrogate di emoji/caratteri fuori dal BMP, e Stripe
 * rifiuterebbe l'unita' orfana).
 *
 * Quando tronca logga campo + lunghezza + limite. MAI il valore: contiene
 * ragione sociale, P.IVA, indirizzo.
 */
export function clampForStripe(value: string, max: number, field: string): string {
    const trimmed = value.trim();
    const points = Array.from(trimmed);
    if (points.length <= max) return trimmed;
    console.warn(`stripe clamp: field=${field} original_length=${points.length} limit=${max}`);
    return points.slice(0, max).join("");
}

/** Applica `clampForStripe` a ogni value del record metadata. */
export function clampMetadata(
    record: Record<string, string>,
    max: number = STRIPE_METADATA_VALUE_MAX
): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record)) {
        out[key] = clampForStripe(value, max, `metadata.${key}`);
    }
    return out;
}
