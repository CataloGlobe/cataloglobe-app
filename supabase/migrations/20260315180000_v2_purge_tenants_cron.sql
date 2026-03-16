BEGIN;

-- =============================================================================
-- V2: Scheduled purge of soft-deleted tenants (pg_cron)
-- =============================================================================
--
-- This migration registers a daily pg_cron job that calls the purge-tenants
-- edge function. The edge function permanently deletes v2_tenants rows where
-- deleted_at < now() - interval '30 days', clearing RESTRICT FK tables first.
--
-- Prerequisites:
--   1. pg_cron extension must be enabled in Supabase Dashboard → Extensions
--   2. The purge-tenants edge function must be deployed
--   3. PURGE_SECRET must be set in:
--        Supabase Dashboard → Edge Functions → purge-tenants → Secrets
--   4. The following two secrets must exist in Vault before applying:
--
--        -- shared secret used by the function to authenticate the cron call
--        SELECT vault.create_secret('your-strong-secret', 'purge_tenants_secret');
--
--        -- public anon key (required by the Supabase gateway for routing)
--        SELECT vault.create_secret('<ANON_KEY>', 'supabase_anon_key');
--
--   5. Replace <PROJECT_REF> in the URL below with the actual project reference.
--
-- Schedule: runs once per day at 03:00 UTC.
--
-- To disable: SELECT cron.unschedule('purge-soft-deleted-tenants');
-- =============================================================================


-- =============================================================================
-- STEP 1: Ensure pg_cron and pg_net are available
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;


-- =============================================================================
-- STEP 2: Register the cron job (idempotent — unschedule first if it exists)
-- =============================================================================
--
-- pg_cron has no IF NOT EXISTS for cron.schedule. Unconditionally unscheduling
-- first makes this migration safe to re-apply (staging resets, rollback/replay).
--
-- The PURGE_SECRET and the anon key are read from Supabase Vault at runtime so
-- they are never stored in plain text in the migration or the job payload.
--
-- NOTE: replace <PROJECT_REF> with the actual Supabase project reference
--       (e.g. 'abcdefghijklmnop') before applying this migration.
-- =============================================================================

-- Remove any existing job with this name to allow idempotent re-application.
SELECT cron.unschedule('purge-soft-deleted-tenants')
FROM   cron.job
WHERE  jobname = 'purge-soft-deleted-tenants';

SELECT cron.schedule(
  'purge-soft-deleted-tenants',           -- job name (must be unique)
  '0 3 * * *',                            -- daily at 03:00 UTC
  $$
  SELECT net.http_post(
    url     => 'https://<PROJECT_REF>.supabase.co/functions/v1/purge-tenants',
    headers => jsonb_build_object(
                 'Content-Type',   'application/json',
                 'apikey',         (SELECT decrypted_secret
                                    FROM   vault.decrypted_secrets
                                    WHERE  name = 'supabase_anon_key'
                                    LIMIT  1),
                 'x-purge-secret', (SELECT decrypted_secret
                                    FROM   vault.decrypted_secrets
                                    WHERE  name = 'purge_tenants_secret'
                                    LIMIT  1)
               ),
    body    => '{}'::jsonb
  );
  $$
);


COMMIT;
