-- =============================================================================
-- CONSERVAZIONE CONTATTI LANDING — schedulazione pg_cron
-- =============================================================================
-- Invoca `purge-leads` ogni notte: cancella i contatti di `public.leads` più
-- vecchi di 12 mesi con status diverso da 'won' (informativa privacy, Sez. 02
-- e 05). Pattern vault identico a 20260903160002_purge_reservation_data_cron.sql.
--
-- PREREQUISITI, da eseguire nel SQL Editor PRIMA di applicare questa migration
-- (i secret non stanno in un file versionato):
--
--   SELECT vault.create_secret(
--     '{SUPABASE_URL}/functions/v1/purge-leads',
--     'purge_leads_url'
--   );
--   SELECT vault.create_secret('<random-32-hex>', 'leads_retention_secret');
--
-- e la stessa stringa come env var della funzione:
--   LEADS_RETENTION_SECRET = <random-32-hex>
--
-- Se un secret manca, il job logga e non fa nulla.
--
-- ⚠️ IL BODY E' `{"dry_run": false}`, cioe' la MODALITA' DISTRUTTIVA. La
-- funzione e' dry-run per default: per una prova invocarla a mano senza body.
--
-- Orario: 03:45 UTC, dopo gli altri job notturni delle 03.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-leads') THEN
        PERFORM cron.unschedule('purge-leads');
    END IF;
END $$;

SELECT cron.schedule(
    'purge-leads',
    '45 3 * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'purge_leads_url'
            LIMIT 1
        );
        v_secret TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'leads_retention_secret'
            LIMIT 1
        );
    BEGIN
        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'purge-leads cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'X-Job-Secret', v_secret
            ),
            body    := '{"dry_run": false}'::jsonb
        );
    END;
    $$;
    $job$
);
