-- =============================================================================
-- CRM interno (F1-9): riepilogo via email ogni lunedì alle 8 di Roma
-- =============================================================================
-- crm_settings.summary_mail_week: il lunedì della settimana già mandata
-- (prenotazione con UPDATE ... WHERE IS DISTINCT FROM: due giri, una mail).
-- Il cron gira alle 6 e alle 7 UTC e passa solo quando a Roma sono le 8
-- (ora legale e solare), poi chiama crm-notify con {"job":"weekly"}.
-- Usa i segreti del vault del cron di crm-notify (20261001130300).
-- =============================================================================

ALTER TABLE public.crm_settings
    ADD COLUMN IF NOT EXISTS summary_mail_week date;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-summary-mail') THEN
        PERFORM cron.unschedule('crm-summary-mail');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-summary-mail',
    '0 6,7 * * 1',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF extract(hour FROM now() AT TIME ZONE 'Europe/Rome') <> 8 THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_notify_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-summary-mail cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{"job":"weekly"}'::jsonb
        );
    END;
    $$;
    $job$
);
