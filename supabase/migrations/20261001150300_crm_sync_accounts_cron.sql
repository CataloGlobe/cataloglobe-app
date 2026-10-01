-- =============================================================================
-- CRM interno (Fase 0): legame con gli account ogni 15 minuti
-- =============================================================================
-- Chiama l'edge `crm-sync-accounts`: collega per telefono i lead che si sono
-- registrati, porta la fase da In prova a Cliente pagante dallo stato
-- dell'abbonamento, propone i collegamenti per email o nome.
-- Solo se nel CRM c'è almeno un contatto con telefono o un locale collegato.
--
-- PREREQUISITI, nel SQL Editor PRIMA di applicare:
--   SELECT vault.create_secret('{SUPABASE_URL}/functions/v1/crm-sync-accounts', 'crm_sync_accounts_url');
-- Il segreto è lo stesso di crm-notify (vault `crm_job_secret` = env
-- CRM_JOB_SECRET), già creato con 20261001130300.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-sync-accounts') THEN
        PERFORM cron.unschedule('crm-sync-accounts');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-sync-accounts',
    '*/15 * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.crm_contacts c WHERE c.phone_e164 IS NOT NULL)
           AND NOT EXISTS (SELECT 1 FROM public.crm_venues v WHERE v.tenant_id IS NOT NULL) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_sync_accounts_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-sync-accounts cron: vault secrets mancanti, skip';
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
