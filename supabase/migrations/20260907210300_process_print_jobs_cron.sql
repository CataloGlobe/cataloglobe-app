-- =============================================================================
-- pg_cron schedule per process-print-jobs (sweeper coda stampa comande)
-- =============================================================================
--
-- Ogni minuto invoca l'edge function process-print-jobs con header
-- X-Job-Secret. Lo sweeper riprende i print_jobs 'pending' (push inline
-- fallito) e i 'processing' orfani (edge morta mentre il push era in volo).
--
-- Il percorso "felice" NON passa da qui: submit-order / submit-order-admin
-- inseriscono il job e chiamano Sunmi subito (EdgeRuntime.waitUntil). Il cron
-- e' la rete di sicurezza, non il percorso principale.
--
-- PRECONDIZIONI (Lorenzo, PRIMA di applicare — su entrambi gli ambienti):
--   1. Inserire in vault.secrets via Dashboard SQL Editor:
--        - 'process_print_jobs_url' = '{SUPABASE_URL}/functions/v1/process-print-jobs'
--        - 'print_job_secret'       = stesso valore di PRINT_JOB_SECRET (edge secret)
--      Esempio:
--        SELECT vault.create_secret(
--          '{SUPABASE_URL}/functions/v1/process-print-jobs',
--          'process_print_jobs_url'
--        );
--        SELECT vault.create_secret('<random-32-hex>', 'print_job_secret');
--   2. Configurare secrets edge function (Settings → Edge Functions → Secrets):
--        - PRINT_JOB_SECRET   (stesso valore del vault sopra)
--        - SUNMI_APP_ID / SUNMI_APP_KEY (gia' presenti dal blocco 1)
--   3. Deploy edge function:
--        supabase functions deploy process-print-jobs --project-ref <ref>
--
-- Se i secret vault mancano il cron logga NOTICE e non chiama nulla
-- (registrazione sicura anche prima della configurazione).
--
-- Pattern vault confermato da 20260503230000_translations_pg_cron.sql.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-print-jobs') THEN
        PERFORM cron.unschedule('process-print-jobs');
    END IF;
END $$;

SELECT cron.schedule(
    'process-print-jobs',
    '* * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_print_jobs_url'
            LIMIT 1
        );
        v_secret TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'print_job_secret'
            LIMIT 1
        );
    BEGIN
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
