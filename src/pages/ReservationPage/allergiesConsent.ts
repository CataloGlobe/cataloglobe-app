/**
 * Versione del testo di consenso per le allergie (`reservation.allergies_consent`).
 * Cambiare il testo vuol dire aggiungere una versione nuova qui e in
 * `supabase/functions/_shared/reservationAllergies.ts`, che rifiuta le
 * versioni che non conosce.
 */
export const ALLERGIES_CONSENT_VERSION = "2026-10-05";
export const ALLERGIES_MAX_LENGTH = 300;
