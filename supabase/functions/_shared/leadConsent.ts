import { PRIVACY_PUBLISHED_AT } from "./consentVersions.ts";

/**
 * Testo salvato in `leads.consent_text`: cosa ha accettato chi ha inviato il
 * form, scritto dal server. Il client non lo manda (non sarebbe una prova):
 * conta il testo pubblicato su /legal/privacy all'invio, cioè la sua data di
 * «Ultimo aggiornamento».
 */
export function leadConsentText(): string {
    return `Informativa privacy versione ${PRIVACY_PUBLISHED_AT} (/legal/privacy)`;
}
