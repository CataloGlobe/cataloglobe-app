-- =========================================
-- Purge stripe_processed_events — daily retention cron
-- =========================================
-- stripe_processed_events is the Stripe idempotency log (one row per processed
-- event). It grows unbounded: nothing ever deletes from it. The idempotency
-- guarantee only needs a recent window — Stripe retries an event for at most a
-- few days — so 30 days of history is far more than enough.
--
-- Convention follows `cleanup_rate_limit_buckets` (20260520214121): a simple
-- DELETE-only cleanup scheduled with inline SQL via pg_cron, made idempotent by
-- unschedule-then-(re)schedule. No SECURITY DEFINER helper is needed because the
-- statement carries no application logic.
--
-- Scheduled at 03:17 daily (off-peak), with an odd minute to avoid colliding
-- with the round-hour daily crons elsewhere in the project.

BEGIN;

-- Remove any previous version of the job (no-op on first apply).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge_stripe_processed_events';

-- (Re)create the job. Runs daily at 03:17.
SELECT cron.schedule(
    'purge_stripe_processed_events',
    '17 3 * * *',
    $$
        DELETE FROM public.stripe_processed_events
        WHERE processed_at < now() - interval '30 days';
    $$
);

COMMIT;
