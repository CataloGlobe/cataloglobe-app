-- =============================================================================
-- RETENTION PRENOTAZIONI — schedulazione pg_cron
-- =============================================================================
-- Invoca `purge-reservation-data` una volta al giorno. Pattern vault identico a
-- 20260503230000_translations_pg_cron.sql e 20260321152029_fix_purge_accounts_cron_vault.sql.
--
-- PREREQUISITI, da eseguire nel SQL Editor PRIMA di applicare questa migration
-- (i secret non stanno in un file versionato):
--
--   SELECT vault.create_secret(
--     '{SUPABASE_URL}/functions/v1/purge-reservation-data',
--     'purge_reservation_data_url'
--   );
--   SELECT vault.create_secret('<random-32-hex>', 'reservation_retention_secret');
--
-- e la stessa stringa come env var della funzione:
--   RESERVATION_RETENTION_SECRET = <random-32-hex>
--
-- Se un secret manca, il job logga e non fa nulla: meglio non cancellare che
-- cancellare al buio.
--
-- ⚠️ IL BODY E' `{"dry_run": false}`, cioe' la MODALITA' DISTRUTTIVA. E' l'unico
-- punto del sistema che la attiva. Per un giro di prova togliere il campo (o
-- metterlo a true): la funzione e' dry-run per default e non scrive nulla.
-- Prima di schedularlo davvero conviene invocarlo a mano in dry-run e leggere
-- il summary.
--
-- Orario: 04:15 UTC, fuori dal servizio di sala in Europa.
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-reservation-data') THEN
        PERFORM cron.unschedule('purge-reservation-data');
    END IF;
END $$;

SELECT cron.schedule(
    'purge-reservation-data',
    '15 4 * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'purge_reservation_data_url'
            LIMIT 1
        );
        v_secret TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'reservation_retention_secret'
            LIMIT 1
        );
    BEGIN
        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'purge-reservation-data cron: vault secrets mancanti, skip';
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
