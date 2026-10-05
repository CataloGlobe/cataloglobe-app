-- =============================================================================
-- CRM interno (F1-3): agente in prova, ogni minuto
-- =============================================================================
-- Chiama l'edge `crm-agent` solo se c'è lavoro (crm_agent_has_work: messaggi
-- del lead senza risposta con le risposte accese, follow-up dovuti, bozze
-- aperte da sollecitare o da far scadere).
--
-- Nessun segreto nuovo: l'indirizzo è quello di `crm_notify_url` con
-- crm-agent al posto di crm-notify (stesso progetto, stessa cartella delle
-- funzioni), il segreto è `crm_job_secret` (20261001130300).
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-agent') THEN
        PERFORM cron.unschedule('crm-agent');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-agent',
    '* * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT public.crm_agent_has_work(now()) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_notify_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL OR position('/crm-notify' IN v_url) = 0 THEN
            RAISE NOTICE 'crm-agent cron: vault secrets mancanti o indirizzo inatteso, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := replace(v_url, '/crm-notify', '/crm-agent'),
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
);
