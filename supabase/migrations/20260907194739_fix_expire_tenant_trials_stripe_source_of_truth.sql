BEGIN;

-- =============================================================================
-- Fix: `expire-tenant-trials` must not touch tenants with a Stripe subscription
-- =============================================================================
--
-- Where a Stripe subscription exists, Stripe is the source of truth for
-- `subscription_status` — the webhook (customer.subscription.updated /
-- invoice.payment_succeeded) reconciles it from the live subscription.
-- The cron previously flipped ANY 'trialing' tenant with an expired
-- `trial_until` to 'past_due', including tenants on a real Stripe trial
-- (subscription_data.trial_period_days). That races the day-31 renewal
-- webhook: if the cron runs before Stripe's invoice/webhook lands, the
-- tenant is briefly (and incorrectly) shown as 'past_due'.
--
-- This job now only expires the legacy, Stripe-less trial path — the one
-- `transfer_ownership()` sets up (subscription_status='trialing',
-- trial_until=now()+14 days, stripe_subscription_id=NULL after resetting
-- the Stripe fields on ownership transfer). Any tenant with a
-- `stripe_subscription_id` is left alone; its status is reconciled by the
-- Stripe webhook exclusively.
--
-- Idempotent re-application: the unschedule below resolves the jobid by
-- `jobname` (never a hardcoded id, so it targets the right job in any
-- environment) and is a no-op if the job is absent — safe to replay
-- (staging reset, rollback).
-- =============================================================================

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'expire-tenant-trials';

SELECT cron.schedule(
    'expire-tenant-trials',
    '0 2 * * *',
    $$
    UPDATE public.tenants
    SET subscription_status = 'past_due'
    WHERE subscription_status = 'trialing'
      AND trial_until IS NOT NULL
      AND trial_until < now()
      AND stripe_subscription_id IS NULL;
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
    WHERE jobname = 'expire-tenant-trials'
      AND schedule = '0 2 * * *'
      AND command ILIKE '%stripe_subscription_id IS NULL%';

    IF job_count = 1 THEN
        RAISE NOTICE 'OK: cron job ''expire-tenant-trials'' updated to skip Stripe-backed tenants.';
    ELSE
        RAISE EXCEPTION 'FAIL: cron job ''expire-tenant-trials'' not found or not updated as expected.';
    END IF;
END $$;

COMMIT;
