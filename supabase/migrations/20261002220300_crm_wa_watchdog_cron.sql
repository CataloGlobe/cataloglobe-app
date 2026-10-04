-- =============================================================================
-- CRM interno (Fase 1, F1-2): Mac di WhatsApp muto, ogni 5 minuti
-- =============================================================================
-- Chiama l'edge `crm-wa-worker` (azione watchdog) solo quando serve: agenti
-- attivi (non in pausa), silenzio non ancora segnalato e nessun battito del
-- Mac negli ultimi 15 minuti. L'edge mette in pausa gli agenti (crm_wa_watchdog) e
-- avvisa il team su Telegram.
--
-- ⚠️ SYNC con le condizioni di `crm_wa_watchdog` (20261002220100). Falso
-- positivo = una chiamata a vuoto; falso negativo = nessun avviso.
--
-- PREREQUISITI, nel SQL Editor PRIMA di applicare (i segreti non stanno in un
-- file versionato):
--
--   SELECT vault.create_secret('{SUPABASE_URL}/functions/v1/crm-wa-worker', 'crm_wa_worker_url');
--
-- `crm_job_secret` esiste già (crm-notify): è lo stesso CRM_JOB_SECRET
-- dell'edge. Se un segreto manca, il job non fa nulla (NOTICE).
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'crm-wa-watchdog') THEN
        PERFORM cron.unschedule('crm-wa-watchdog');
    END IF;
END $$;

SELECT cron.schedule(
    'crm-wa-watchdog',
    '*/5 * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM public.crm_settings s, public.crm_wa_channel c
            WHERE s.id AND c.id
              AND NOT s.brake_on
              AND c.silent_alerted_at IS NULL
              AND (c.last_heartbeat_at IS NULL OR c.last_heartbeat_at < now() - interval '15 minutes')
        ) THEN
            RETURN;
        END IF;

        v_url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_wa_worker_url' LIMIT 1);
        v_secret := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'crm_job_secret' LIMIT 1);

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'crm-wa-watchdog cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'X-Job-Secret', v_secret),
            body    := '{"action":"watchdog"}'::jsonb
        );
    END;
    $$;
    $job$
);
