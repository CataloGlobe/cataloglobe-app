-- =============================================================================
-- CRM interno (F1-4a): agenda, ogni 5 minuti
-- =============================================================================
-- 1. Accoda i promemoria dovuti al lead (crm_agenda_enqueue_reminders, solo
--    SQL: niente chiamata HTTP). Poi li manda la coda WhatsApp della #188.
-- 2. Se c'è lavoro per l'edge (crm_agenda_has_work: evento Google da
--    scrivere, «Puoi tu?» a chi chiama, brief un'ora prima, «Com'è andata?»)
--    chiama `crm-notify` con il body {"job":"agenda"}.
--
-- Usa i segreti del vault già creati per il cron di crm-notify (20261001130300):
-- `crm_notify_url` e `crm_job_secret`. Nessun prerequisito nuovo.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-agenda') THEN
        PERFORM cron.unschedule('crm-agenda');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-agenda',
    '*/5 * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        PERFORM public.crm_agenda_enqueue_reminders(now());

        IF NOT public.crm_agenda_has_work(now()) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_notify_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-agenda cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{"job":"agenda"}'::jsonb
        );
    END;
    $$;
    $job$
);
