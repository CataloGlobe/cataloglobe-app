import type { SubscriptionStateUnavailableReason } from "@/services/supabase/billing";

/**
 * Mailto for the "subscription cannot be read" banner on the Abbonamento page.
 * The body carries the tenant id so support can find the row without asking:
 * the customer only sees their company name in the text.
 */
export function buildSubscriptionSupportMailto(input: {
    supportEmail: string;
    tenantId: string;
    tenantName: string;
}): string {
    const subject = `Abbonamento CataloGlobe — ${input.tenantName}`;
    const body =
        `Salve, dalla pagina Abbonamento di «${input.tenantName}» non riesco a leggere i dati del mio abbonamento ` +
        `né a modificare piano, sedi o fatturazione.\n\nRiferimento azienda: ${input.tenantId}`;
    return `mailto:${input.supportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Banner copy per unavailability reason: permanent (support) vs transient (reload). */
export const SUBSCRIPTION_UNAVAILABLE_MESSAGE: Record<SubscriptionStateUnavailableReason, string> = {
    subscription_missing:
        "Non riusciamo a leggere i dati del tuo abbonamento. Il servizio resta attivo; per modificare piano, sedi o fatturazione scrivi all'assistenza indicando il nome della tua azienda.",
    stripe_unavailable:
        "Non riusciamo a leggere i dati del tuo abbonamento in questo momento. Il servizio resta attivo; ricarica tra qualche minuto."
};
