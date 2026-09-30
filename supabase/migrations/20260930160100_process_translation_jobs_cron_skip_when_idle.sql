-- =============================================================================
-- process-translation-jobs cron: niente chiamata HTTP quando la coda e' vuota
-- =============================================================================
--
-- Prima: a ogni tick net.http_post verso l'edge function, anche a coda vuota.
-- Ora: il comando del job chiama l'edge solo se esiste almeno un job che
-- claim_pending_translation_jobs toccherebbe:
--   - 'processing' stantio (claimed_at NULL o oltre 5 minuti), a prescindere
--     da lingua e tentativi: al cap lo statement 1 del claim lo chiude a
--     'failed' senza guardare la lingua;
--   - 'pending' la cui lingua e' eleggibile (job di sistema tenant_id NULL,
--     o lingua attiva in tenant_languages): un pending su lingua spenta il
--     claim non lo prende, e contarlo qui farebbe chiamare l'edge a vuoto
--     a ogni tick finche' la lingua resta spenta.
-- Il 'processing' stantio sotto il cap su lingua spenta resta nel primo
-- ramo: falso positivo raro (una chiamata a vuoto), scelto per non duplicare
-- qui anche il guard lingua sul reclaim.
--
-- ⚠️ SYNC: le condizioni rispecchiano claim_pending_translation_jobs (live,
-- default p_reclaim_after_minutes = 5, non passato dall'edge). Se cambia il
-- claim, cambia anche qui.
--
-- Letture sugli indici parziali translation_jobs_pending_idx e
-- translation_jobs_reclaim_idx. Il job gira come postgres: niente RLS.
--
-- cron.alter_job cambia solo il comando: lo schedule resta quello live
-- (staging e' ancora '*/2 * * * *', la 20260505140000 lo porterebbe a
-- '30 seconds': questa migration non lo tocca).
-- Un solo comando nel file (regola db push, 42601).
-- =============================================================================

DO $migration$
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
        job_id  := v_jobid,
        command := $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM public.translation_jobs j
            WHERE j.status = 'processing'
              AND (
                  j.claimed_at IS NULL
                  OR j.claimed_at < now() - interval '5 minutes'
              )
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.translation_jobs j
            WHERE j.status = 'pending'
              AND (
                  j.tenant_id IS NULL
                  OR EXISTS (
                      SELECT 1
                      FROM public.tenant_languages tl
                      WHERE tl.tenant_id = j.tenant_id
                        AND tl.language_code = j.target_language_code
                        AND tl.is_active = true
                  )
              )
        ) THEN
            RETURN;
        END IF;

        v_url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_translation_jobs_url'
            LIMIT 1
        );
        v_secret := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'translation_job_secret'
            LIMIT 1
        );

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'process-translation-jobs cron: vault secrets mancanti, skip';
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
