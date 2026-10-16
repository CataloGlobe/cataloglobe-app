-- =============================================================================
-- Cron process-notification-emails: svuota la coda delle email del motore
-- =============================================================================
--
-- Ogni minuto, ma chiama l'edge `send-notification-emails` solo se c'è almeno
-- un'email che claim_pending_notification_emails prenderebbe:
--   - 'pending' con run_after passato;
--   - 'processing' stantio (claimed_at NULL o oltre 5 minuti), a prescindere
--     dai tentativi: sotto il cap viene ripreso, al cap lo chiude a 'failed'
--     lo statement 1 del claim.
-- Coda vuota = nessuna chiamata HTTP (come process-print-jobs, 20260930160000).
--
-- ⚠️ SYNC: condizioni uguali a claim_pending_notification_emails
-- (20261015020000, default p_reclaim_after_minutes = 5, non passato dall'edge).
-- Falso positivo = una chiamata a vuoto; falso negativo = coda ferma.
--
-- Prerequisiti (una volta per ambiente, a mano, mai in una migration):
--   SELECT vault.create_secret('{SUPABASE_URL}/functions/v1/send-notification-emails', 'process_notification_emails_url');
--   SELECT vault.create_secret('<random-32-hex>', 'notification_email_job_secret');
--   e lo stesso valore come segreto dell'edge: NOTIFICATION_EMAIL_JOB_SECRET.
-- Senza i due segreti nel vault il job non chiama nulla (NOTICE e basta).
--
-- Un solo comando nel file (regola db push, 42601).
-- =============================================================================

DO $migration$
DECLARE
    v_jobid bigint;
BEGIN
    SELECT jobid INTO v_jobid
    FROM cron.job
    WHERE jobname = 'process-notification-emails';

    IF v_jobid IS NOT NULL THEN
        PERFORM cron.unschedule(v_jobid);
    END IF;

    PERFORM cron.schedule(
        'process-notification-emails',
        '* * * * *',
        $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM public.notification_emails e
            WHERE (e.status = 'pending' AND e.run_after <= now())
               OR (
                   e.status = 'processing'
                   AND (
                       e.claimed_at IS NULL
                       OR e.claimed_at < now() - interval '5 minutes'
                   )
               )
        ) THEN
            RETURN;
        END IF;

        v_url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_notification_emails_url'
            LIMIT 1
        );
        v_secret := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'notification_email_job_secret'
            LIMIT 1
        );

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'process-notification-emails cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'X-Job-Secret', v_secret
            ),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
    );
END;
$migration$;
