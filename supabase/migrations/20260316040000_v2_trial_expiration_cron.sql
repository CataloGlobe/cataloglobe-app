BEGIN;

-- =============================================================================
-- V2: Daily pg_cron job to expire tenant trials
-- =============================================================================
--
-- Registers a daily job that transitions tenants from 'trial' to 'past_due'
-- once their trial_until timestamp has passed.
--
-- The UPDATE is safe to run repeatedly (only rows that still match
-- subscription_status = 'trial' AND trial_until < now() are affected).
--
-- Prerequisites:
--   pg_cron extension must be enabled (Supabase Dashboard → Extensions).
--   20260316020000_v2_tenant_billing_fields.sql must be applied first
--   (adds plan, subscription_status, trial_until to v2_tenants).
--
-- Idempotency:
--   The existing job with the same name is unconditionally unscheduled before
--   re-registering, so this migration is safe to re-apply (staging resets,
--   rollback/replay).
--
-- Schedule: 02:00 UTC daily (offset from the purge job at 03:00 UTC to avoid
-- simultaneous load on v2_tenants).
-- =============================================================================


-- =============================================================================
-- STEP 1: Ensure pg_cron is available
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;


-- =============================================================================
-- STEP 2: Remove any existing job with this name (idempotent re-application)
-- =============================================================================

SELECT cron.unschedule('expire-tenant-trials')
FROM cron.job
WHERE jobname = 'expire-tenant-trials';


-- =============================================================================
-- STEP 3: Register the cron job
-- =============================================================================

SELECT cron.schedule(
    'expire-tenant-trials',
    '0 2 * * *',
    $$
    UPDATE public.v2_tenants
    SET subscription_status = 'past_due'
    WHERE subscription_status = 'trial'
      AND trial_until IS NOT NULL
      AND trial_until < now();
    $$
);


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    job_count int;
BEGIN
    SELECT COUNT(*) INTO job_count
    FROM cron.job
    WHERE jobname  = 'expire-tenant-trials'
      AND schedule = '0 2 * * *';

    IF job_count = 1 THEN
        RAISE NOTICE 'OK: cron job ''expire-tenant-trials'' registered at ''0 2 * * *''.';
    ELSE
        RAISE EXCEPTION 'FAIL: cron job ''expire-tenant-trials'' not found after scheduling.';
    END IF;
END $$;


COMMIT;
