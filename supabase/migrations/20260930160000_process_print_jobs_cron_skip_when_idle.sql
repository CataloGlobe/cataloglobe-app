-- =============================================================================
-- process-print-jobs cron: niente chiamata HTTP quando la coda e' vuota
-- =============================================================================
--
-- Prima: ogni minuto net.http_post verso l'edge function, anche a coda vuota
-- (1440 invocazioni/giorno per ambiente, quasi tutte a vuoto).
-- Ora: il comando del job guarda print_jobs e chiama l'edge solo se esiste
-- almeno un job che claim_pending_print_jobs toccherebbe:
--   - 'pending';
--   - 'processing' stantio (claimed_at NULL o oltre 5 minuti), a prescindere
--     dai tentativi: sotto il cap viene ripreso, al cap viene chiuso a
--     'failed' dallo statement 1 del claim. Senza questo ramo i poison
--     resterebbero 'processing' per sempre.
-- I 'processing' recenti sono in volo: nessuna chiamata.
--
-- ⚠️ SYNC: le condizioni rispecchiano claim_pending_print_jobs (live, default
-- p_reclaim_after_minutes = 5, non passato dall'edge). Se cambia il claim,
-- cambia anche qui. Un falso positivo costa una chiamata a vuoto; un falso
-- negativo lascia la coda ferma.
--
-- Letture sugli indici parziali idx_print_jobs_pending e
-- idx_print_jobs_processing_claimed. Il job gira come postgres: niente RLS.
--
-- cron.alter_job cambia solo il comando: lo schedule resta quello live.
-- Un solo comando nel file (regola db push, 42601).
-- =============================================================================

DO $migration$
DECLARE
    v_jobid bigint;
BEGIN
    SELECT jobid
      INTO v_jobid
      FROM cron.job
     WHERE jobname = 'process-print-jobs';

    IF v_jobid IS NULL THEN
        RAISE NOTICE 'cron job process-print-jobs not found, skip alter';
        RETURN;
    END IF;

    PERFORM cron.alter_job(
        job_id  := v_jobid,
        command := $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM public.print_jobs j
            WHERE j.status = 'pending'
               OR (
                   j.status = 'processing'
                   AND (
                       j.claimed_at IS NULL
                       OR j.claimed_at < now() - interval '5 minutes'
                   )
               )
        ) THEN
            RETURN;
        END IF;

        v_url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_print_jobs_url'
            LIMIT 1
        );
        v_secret := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'print_job_secret'
            LIMIT 1
        );

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'process-print-jobs cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type',   'application/json',
                'X-Job-Secret',   v_secret
            ),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
    );
END;
$migration$;
