/**
 * Allergie nel modulo pubblico di prenotazione.
 *
 * Dato sulla salute (art. 9 GDPR): si accetta solo con il consenso esplicito
 * della casella dedicata, che porta la versione del testo mostrato. La
 * versione deve essere una di quelle note: un testo nuovo aggiunge una voce
 * qui e in `src/pages/ReservationPage/allergiesConsent.ts`, non la sostituisce
 * (le prenotazioni già salvate citano la vecchia).
 *
 * Funzione pura, senza Deno: la edge `submit-reservation` la chiama sul body,
 * i test la provano con vitest.
 */

export const ALLERGIES_CONSENT_VERSIONS = ["2026-10-05"] as const;
export const ALLERGIES_MAX_LENGTH = 300;

export type ParsedAllergies =
    | { ok: true; value: { allergies: string; consentVersion: string } | null }
    | { ok: false; code: "INVALID_PAYLOAD"; details: { field: string; reason: string } };

export function parseAllergies(body: {
    allergies?: unknown;
    allergies_consent_version?: unknown;
}): ParsedAllergies {
    const raw = body.allergies;
    if (raw === undefined || raw === null) return { ok: true, value: null };
    if (typeof raw !== "string") {
        return { ok: false, code: "INVALID_PAYLOAD", details: { field: "allergies", reason: "type" } };
    }
    const allergies = raw.trim();
    // Campo vuoto con la casella spuntata: niente da salvare, nessun consenso
    // da registrare.
    if (allergies.length === 0) return { ok: true, value: null };
    if (allergies.length > ALLERGIES_MAX_LENGTH) {
        return { ok: false, code: "INVALID_PAYLOAD", details: { field: "allergies", reason: "too_long" } };
    }
    const version = body.allergies_consent_version;
    if (
        typeof version !== "string" ||
        !(ALLERGIES_CONSENT_VERSIONS as readonly string[]).includes(version)
    ) {
        return {
            ok: false,
            code: "INVALID_PAYLOAD",
            details: { field: "allergies_consent_version", reason: "missing_consent" }
        };
    }
    return { ok: true, value: { allergies, consentVersion: version } };
}
