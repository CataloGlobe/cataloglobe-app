-- =============================================================================
-- CRM interno (Fase 0): conservazione 12 mesi, ogni notte
-- =============================================================================
-- Chiama l'edge `crm-purge` alle 04:15 UTC, dopo `purge-leads` (03:45): i
-- contatti della landing scaduti spariscono prima da `leads`, poi la loro
-- carta dal CRM la notte stessa (vedi crm_purge_venues).
--
-- ⚠️ IL BODY E' `{}`, cioe' DRY-RUN: il job conta e logga, non cancella.
-- Per accenderlo, dopo aver controllato i conteggi nei log, una migration
-- nuova con cron.alter_job(command := ...) e body `{"dry_run": false}`.
--
-- PREREQUISITI, nel SQL Editor PRIMA di applicare:
--   SELECT vault.create_secret('{SUPABASE_URL}/functions/v1/crm-purge', 'crm_purge_url');
-- Il segreto è quello di crm-notify (vault `crm_job_secret` = env
-- CRM_JOB_SECRET), già creato con 20261001130300.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-purge') THEN
        PERFORM cron.unschedule('crm-purge');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-purge',
    '15 4 * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM public.crm_venues) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_purge_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-purge cron: vault secrets mancanti, skip';
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
