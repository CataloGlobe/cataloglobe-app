-- =============================================================================
-- CRM interno: promemoria dei rinnovi degli abbonamenti, ogni giorno alle 9 di
-- Roma
-- =============================================================================
-- Chiama `crm-notify` con il body {"job":"renewals"} solo se c'è un rinnovo da
-- ricordare (`crm_expense_renewals_due`, la stessa funzione che legge l'edge:
-- niente regola copiata). Gira alle 7 e alle 8 UTC e passa solo quando a Roma
-- sono le 9, così l'ora resta giusta con l'ora legale e con quella solare.
--
-- Usa i segreti del vault già creati per il cron di crm-notify (20261001130300):
-- `crm_notify_url` e `crm_job_secret`. Nessun prerequisito nuovo.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-expense-reminders') THEN
        PERFORM cron.unschedule('crm-expense-reminders');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-expense-reminders',
    '0 7,8 * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF extract(hour FROM now() AT TIME ZONE 'Europe/Rome') <> 9 THEN
            RETURN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.crm_expense_renewals_due()) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_notify_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-expense-reminders cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{"job":"renewals"}'::jsonb
        );
    END;
    $$;
    $job$
);
