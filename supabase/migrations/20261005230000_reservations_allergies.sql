-- =========================================
-- RESERVATIONS — allergie con consenso esplicito
-- =========================================
-- Le allergie sono dati sulla salute (art. 9 GDPR): servono un campo dedicato
-- e un consenso esplicito, non la frase generica sotto «Invia» (decisione di
-- Alex e Lorenzo, call del 2026-10-04). Il modulo pubblico mostra una casella
-- non spuntata; solo con la spunta il campo si compila e si salva.
--
-- `allergies_consent_at` è l'ora del server al momento dell'invio,
-- `allergies_consent_version` la versione del testo mostrato al cliente
-- (come `consent_text` dei lead). Il CHECK impedisce allergie senza consenso
-- registrato: la edge `submit-reservation` è l'unico scrittore, ma il vincolo
-- vale anche per chi ne aggiungerà un altro.
--
-- Scrittura: UPDATE mirato subito dopo `place_online_reservation`, come per
-- `customer_phone_e164`: la RPC resta intatta.
--
-- Un solo comando: `supabase db push` fallisce con 42601 sui file multipli.

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS allergies text,
    ADD COLUMN IF NOT EXISTS allergies_consent_at timestamptz,
    ADD COLUMN IF NOT EXISTS allergies_consent_version text,
    -- DROP IF EXISTS + ADD nello stesso ALTER: la migrazione si può rieseguire.
    DROP CONSTRAINT IF EXISTS reservations_allergies_consent_check,
    DROP CONSTRAINT IF EXISTS reservations_allergies_length_check,
    ADD CONSTRAINT reservations_allergies_consent_check CHECK (
        allergies IS NULL
        OR (allergies_consent_at IS NOT NULL AND allergies_consent_version IS NOT NULL)
    ),
    ADD CONSTRAINT reservations_allergies_length_check CHECK (
        allergies IS NULL OR char_length(allergies) <= 300
    );
