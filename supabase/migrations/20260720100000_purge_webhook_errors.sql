-- =========================================
-- Purge webhook_errors — daily retention cron
-- =========================================
-- webhook_errors is a debug audit trail for stripe-webhook application bugs
-- (event_id, event_type, error_message/stack, a PII-stripped payload
-- snapshot). It grows unbounded: nothing ever deletes from it. These rows
-- are only useful for near-term post-mortem debugging ("customer paid but
-- doesn't see the activation") — 90 days is far more than enough to
-- diagnose and follow up on any such report.
--
-- Convention follows `purge_stripe_processed_events` (20260619150000): a
-- simple DELETE-only cleanup scheduled with inline SQL via pg_cron, made
-- idempotent by unschedule-then-(re)schedule. No SECURITY DEFINER helper is
-- needed because the statement carries no application logic.
--
-- occurred_at already exists on webhook_errors (NOT NULL DEFAULT now(),
-- migration 20260428100000) — no column addition needed.
--
-- Scheduled at 03:29 daily (off-peak), distinct minute from the other daily
-- purge crons to avoid collision.

BEGIN;

-- Remove any previous version of the job (no-op on first apply).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'purge_webhook_errors';

-- (Re)create the job. Runs daily at 03:29.
SELECT cron.schedule(
    'purge_webhook_errors',
    '29 3 * * *',
    $$
        DELETE FROM public.webhook_errors
        WHERE occurred_at < now() - interval '90 days';
    $$
);

COMMIT;
