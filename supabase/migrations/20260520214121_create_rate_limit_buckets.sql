-- =========================================
-- ORDERS EPIC — Phase 2.3a: rate_limit_buckets storage
-- =========================================
-- Backing store for fixed-window rate limiting used by client-facing Edge
-- Functions (primary consumer: submit-order, task 2.5 — 10 req/min per
-- customer_session_id). A future shared utility `rateLimit.ts` (task 2.3b)
-- will UPSERT counters keyed by `bucket_key` + `window_start`.
--
-- Rate-limit algorithm (fixed-window counter):
--   1. Caller derives `bucket_key`, e.g. "session:<uuid>:submit-order".
--   2. Caller computes `window_start = date_trunc('minute', now())` (or any
--      coarser/finer window — semantics live in the application).
--   3. UPSERT (bucket_key) → if row's `window_start` matches: increment
--      `count`; if it differs (new window): reset `count` to 1 and bump
--      `window_start`.
--   4. Reject the request when `count` exceeds the application-defined limit.
--
-- Why a dedicated table (no KV / no in-memory):
--   - production-ready today, no experimental dependencies;
--   - persistent and shared across Deno worker instances (Edge Functions
--     are stateless and scaled horizontally);
--   - inspectable from SQL Editor for debugging hot keys / abuse.
--
-- Schema is deliberately minimal: storage is only a counter. Per-endpoint
-- limits and window widths live in the Edge Function code so they can be
-- tuned without DB migrations.
--
-- Security model:
--   - Accessed exclusively via the Supabase `service_role` (bypasses RLS).
--   - RLS is enabled but no policies are defined, so any direct anon /
--     authenticated access is denied by default. The table never appears
--     in client-side code paths.
--   - No `tenant_id` column: rate limiting must work for anon callers
--     before any tenant context is established (e.g. resolve-table).
--
-- Cleanup:
--   - Hourly cron job `cleanup_rate_limit_buckets` deletes rows whose
--     `updated_at` is older than 1h. The largest sensible window we
--     intend to use is a few minutes; beyond 1h the state is dead weight.
--   - Scheduled at minute 10 of every hour to avoid colliding with the
--     other daily cron (`daily_reset_availability` at 04:00 UTC).

BEGIN;

-- =========================================
-- Table
-- =========================================

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    bucket_key   text        PRIMARY KEY,
    window_start timestamptz NOT NULL,
    count        int         NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.rate_limit_buckets IS
    'Fixed-window rate-limit counters. Accessed only by Edge Functions via service_role; RLS enabled with no policies.';

-- Index supports the hourly cleanup job and ad-hoc debugging queries that
-- look at recently-active buckets.
CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_updated_at
    ON public.rate_limit_buckets (updated_at);

-- =========================================
-- updated_at trigger
-- =========================================

DROP TRIGGER IF EXISTS rate_limit_buckets_set_updated_at ON public.rate_limit_buckets;
CREATE TRIGGER rate_limit_buckets_set_updated_at
    BEFORE UPDATE ON public.rate_limit_buckets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS (enabled, no policies → service_role only)
-- =========================================

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- =========================================
-- Cleanup cron job
-- =========================================

-- Remove any previous version of the job (no-op on first apply).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'cleanup_rate_limit_buckets';

-- (Re)create the job. Runs at minute 10 of every hour.
SELECT cron.schedule(
    'cleanup_rate_limit_buckets',
    '10 * * * *',
    $$
        DELETE FROM public.rate_limit_buckets
        WHERE updated_at < now() - interval '1 hour';
    $$
);

COMMIT;
