-- =============================================================================
-- DROP close_stale_seatings() — cambia il tipo di ritorno (11/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. La nuova versione (20260915131100) restituisce jsonb
-- `{closed, skipped}` invece di integer: chiuse e saltate sono due fatti
-- diversi. Postgres non permette di cambiare il tipo di ritorno con CREATE OR
-- REPLACE: DROP prima, un comando per file. Il job pg_cron
-- `close-stale-seatings` (20260914160500) chiama la funzione per nome in un
-- testo SQL: non serve rischedularlo. ACL ricreata in 131200.

DROP FUNCTION public.close_stale_seatings();
