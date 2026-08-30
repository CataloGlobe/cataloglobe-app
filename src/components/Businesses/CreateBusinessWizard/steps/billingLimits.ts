/**
 * Lunghezze massime dei campi fiscali a testo libero del wizard.
 *
 * Tarate sull'uso reale (una ragione sociale italiana sta ampiamente sotto i
 * 200 caratteri), NON sui limiti dell'API Stripe: questi campi confluiscono in
 * `customer.name`, `customer.description` e `metadata`, dove un valore fuori
 * scala fa fallire la creazione del customer e quindi il checkout (502
 * `stripe_customer_create_failed`). L'edge applica comunque un clamp difensivo
 * — vedi `supabase/functions/_shared/stripeLimits.ts`.
 */
export const BILLING_FIELD_MAX = {
    legalName: 200,
    firstName: 100,
    lastName: 100,
    codiceDestinatario: 7,
    pec: 100,
    // Indirizzo: `AddressAutocomplete` e' solo quick-fill, i campi sotto restano
    // editabili a mano → testo libero come gli altri. Riferimento di dominio:
    // FatturaPA vuole Indirizzo <= 60, NumeroCivico <= 8, Comune <= 60; teniamo
    // margine ma restiamo ampiamente sotto i limiti di stringa dell'API Stripe.
    address: 200,
    streetNumber: 10,
    city: 100,
} as const;

/** Messaggio d'errore lunghezza, o `undefined` se il valore rientra nel limite. */
export function billingLengthError(value: string, max: number): string | undefined {
    const length = value.trim().length;
    return length > max ? `Massimo ${max} caratteri (attuali: ${length}).` : undefined;
}
