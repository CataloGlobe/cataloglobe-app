/**
 * Versione del testo di consenso per le allergie (`reservation.allergies_consent`).
 * Cambiare il testo vuol dire aggiungere una versione nuova qui e in
 * `supabase/functions/_shared/reservationAllergies.ts`, che rifiuta le
 * versioni che non conosce.
 */
export const ALLERGIES_CONSENT_VERSION = "2026-10-05";
export const ALLERGIES_MAX_LENGTH = 300;

/**
 * Raccolta delle allergie accesa solo con `VITE_RESERVATION_ALLERGIES="true"`.
 * Spenta di default finché non è deciso come il cliente ritira il consenso
 * (art. 7(3) GDPR). Il flag gemello lato edge è
 * `RESERVATION_ALLERGIES_ENABLED` in `submit-reservation`: vanno accesi insieme.
 */
export const ALLERGIES_ENABLED = import.meta.env.VITE_RESERVATION_ALLERGIES === "true";
