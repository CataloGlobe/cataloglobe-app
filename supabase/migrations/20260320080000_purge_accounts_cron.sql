-- =============================================================================
-- Schedule purge-accounts Edge Function via pg_cron + pg_net
--
-- Runs daily at 03:00 UTC. Uses net.http_post() to call the Edge Function.
--
-- ⚠️  BEFORE APPLYING THIS MIGRATION:
--     Replace the two placeholder values below with your actual values:
--
--     v_url    → your Supabase project URL
--                e.g. https://abcdefghijkl.supabase.co/functions/v1/purge-accounts
--
--     v_secret → the value of your PURGE_SECRET environment variable
--
-- Both pg_cron and pg_net must be enabled in your Supabase project
-- (Dashboard → Database → Extensions) before this migration runs.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- Idempotent job creation
-- Drop the job first if it already exists, then recreate.
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
    'purge_accounts_daily',
    '0 3 * * *',    -- daily at 03:00 UTC
    $job$
    DO $$
    DECLARE
        v_url    text := 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-accounts';
        v_secret text := '<PURGE_SECRET>';
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'x-purge-secret', v_secret
            ),
            body    := '{"dry_run": false}'::jsonb
        );
    END;
    $$;
    $job$
);

COMMIT;
