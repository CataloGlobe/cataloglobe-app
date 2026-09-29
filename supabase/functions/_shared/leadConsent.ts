import { CURRENT_CONSENT_VERSIONS } from "./consentVersions.ts";

/**
 * Testo salvato in `leads.consent_text`: cosa ha accettato chi ha inviato il
 * form, scritto dal server. Il client non lo manda (non sarebbe una prova):
 * conta la versione dell'informativa in vigore all'invio, la stessa che il
 * frontend pubblica su /legal/privacy.
 */
export function leadConsentText(): string {
    return `Informativa privacy versione ${CURRENT_CONSENT_VERSIONS.privacy} (/legal/privacy)`;
}
