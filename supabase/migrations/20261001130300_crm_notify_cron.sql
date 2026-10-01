-- =============================================================================
-- CRM interno (Fase 0): notifiche e solleciti Telegram, ogni minuto
-- =============================================================================
-- Chiama l'edge `crm-notify` solo se c'è lavoro (pattern skip-when-idle di
-- 20260930160000):
--   * un lead non ancora notificato (outbox: crm_leads.notified_at IS NULL);
--   * un import CSV col riepilogo da mandare (crm_import_runs.notified_at IS NULL);
--   * oppure, tra le 9 e le 21 di Roma, un lead notificato e mai sollecitato
--     la cui carta è ancora in Nuovo da più di 2 ore reali.
--
-- ⚠️ SYNC: prefiltro di `isEscalationDue` (_shared/crmTelegram.ts), che conta
-- solo i minuti nella fascia 9-21. Falso positivo = una chiamata a vuoto;
-- falso negativo = un sollecito che non parte.
--
-- PREREQUISITI, nel SQL Editor PRIMA di applicare (i segreti non stanno in un
-- file versionato):
--
--   SELECT vault.create_secret('{SUPABASE_URL}/functions/v1/crm-notify', 'crm_notify_url');
--   SELECT vault.create_secret('<random-32-hex>', 'crm_job_secret');
--
-- e la stessa stringa come env della funzione: CRM_JOB_SECRET = <random-32-hex>.
-- Se un segreto manca, il job non fa nulla (NOTICE).
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-notify') THEN
        PERFORM cron.unschedule('crm-notify');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-notify',
    '* * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
        v_rome_hour int := extract(hour FROM now() AT TIME ZONE 'Europe/Rome');
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM public.crm_leads l WHERE l.notified_at IS NULL
        ) AND NOT EXISTS (
            SELECT 1 FROM public.crm_import_runs r WHERE r.notified_at IS NULL
        ) AND NOT (
            v_rome_hour BETWEEN 9 AND 20
            AND EXISTS (
                SELECT 1
                FROM public.crm_leads l
                JOIN public.crm_venues v ON v.id = l.venue_id
                WHERE v.stage = 'nuovo'
                  AND l.notified_at IS NOT NULL
                  AND l.escalated_at IS NULL
                  AND l.received_at < now() - interval '2 hours'
                  AND l.received_at > now() - interval '7 days'
            )
        ) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_notify_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-notify cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
);
