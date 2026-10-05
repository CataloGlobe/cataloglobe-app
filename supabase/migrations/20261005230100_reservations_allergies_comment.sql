-- Commento della colonna allergie (vedi 20261005230000).
-- Un solo comando: `supabase db push` fallisce con 42601 sui file multipli.

COMMENT ON COLUMN public.reservations.allergies IS
    'Allergie scritte dal cliente nel modulo pubblico, solo con consenso esplicito (allergies_consent_at, allergies_consent_version). Dato sulla salute: azzerato da purge-reservation-data insieme alle note.';
