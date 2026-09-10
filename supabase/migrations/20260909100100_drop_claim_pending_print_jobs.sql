-- =============================================================================
-- claim_pending_print_jobs — drop pre-v2 (regola: RETURNS TABLE cambia tipo)
-- =============================================================================
--
-- Blocco 3a aggiunge `kind` al RETURNS TABLE. Postgres non permette
-- CREATE OR REPLACE FUNCTION quando cambia la lista/tipo delle colonne di
-- ritorno: serve DROP esplicito prima del CREATE (v2, file successivo).
--
-- Finestra di rischio: tra questo DROP e il CREATE del file successivo la
-- funzione non esiste. Se pg_cron invocasse process-print-jobs esattamente in
-- quella finestra (migration applicate non atomicamente, o cron scattato a
-- cavallo del deploy), quel singolo tick fallirebbe la RPC e la edge
-- risponderebbe 500 "claim_failed" — nessun job viene perso (restano
-- 'pending'/'processing', li riprende il tick successivo). Accettabile: i due
-- file vanno applicati in sequenza ravvicinata.
-- =============================================================================

DROP FUNCTION IF EXISTS public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER);
