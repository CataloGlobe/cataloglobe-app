-- =============================================================================
-- Translation cron schedule: 30 seconds
-- =============================================================================
-- Modifica lo schedule del job pg_cron 'process-translation-jobs' da
-- '*/2 * * * *' (ogni 2 minuti, default originale) a '30 seconds'.
--
-- Razionale UX:
--   Con schedule 2 min, il TranslationProgressWidget mostrava barre
--   "saltellanti" (avanzava ogni 2 min). Con 30 sec, l'avanzamento e' piu'
--   fluido per l'utente senza impatto rilevante su quota Edge Function
--   (4x chiamate, ma batch processing identico).
--
-- Concurrency safety:
--   La RPC claim_pending_translation_jobs usa FOR UPDATE SKIP LOCKED, quindi
--   esecuzioni sovrapposte del cron non processano lo stesso job 2 volte.
--
-- Idempotenza:
--   cron.alter_job e' idempotente. Se lo schedule e' gia' '30 seconds',
--   la chiamata e' no-op. Se il job non esiste (es. ambiente fresh prima
--   della migration originale che lo crea), il blocco emette NOTICE e
--   ritorna senza errore.
-- =============================================================================

DO $$
DECLARE
    v_jobid bigint;
BEGIN
    SELECT jobid
      INTO v_jobid
      FROM cron.job
     WHERE jobname = 'process-translation-jobs';

    IF v_jobid IS NULL THEN
        RAISE NOTICE 'cron job process-translation-jobs not found, skip alter';
        RETURN;
    END IF;

    PERFORM cron.alter_job(
        job_id   := v_jobid,
        schedule := '30 seconds'
    );

    RAISE NOTICE 'cron job process-translation-jobs schedule set to 30 seconds';
END;
$$;
