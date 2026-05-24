-- =========================================
-- ORDERS EPIC — Phase 1.10: Realtime publication + pg_cron
-- =========================================
-- Closes Phase 1 (Foundations DB) of the table-ordering epic. Two
-- distinct concerns bundled in a single migration because they are the
-- final infrastructure pieces, both small, and neither warrants its own
-- file.
--
-- Part A — Realtime publication
--   Adds three tables to the `supabase_realtime` publication so the
--   Supabase Realtime server streams INSERT/UPDATE/DELETE events to
--   subscribed clients. RLS policies declared on each table are
--   automatically enforced by Realtime before a change is broadcast:
--   a client only receives events for rows it could SELECT.
--
--   Tables added:
--     - public.orders             — guests follow status transitions
--                                   (acknowledged → preparing → ready
--                                   → delivered); admins see new orders
--                                   arrive in the dashboard.
--     - public.customer_sessions  — admin "Tavoli attivi" view watches
--                                   sessions appear / expire.
--     - public.order_groups       — admin sees a group open / close as
--                                   guests arrive and the table is bussed.
--
--   Deliberately NOT added:
--     - public.order_items — items are immutable after insert. They are
--       delivered to clients as part of the initial JOIN query and never
--       change afterwards, so a Realtime channel would only generate
--       noise. If a future feature mutates items (e.g. admin edits),
--       a one-line `ALTER PUBLICATION ... ADD TABLE` migration is enough.
--
-- Part B — pg_cron: daily_reset_availability
--   Runs every day at 04:00 UTC (early-morning Europe time, well before
--   restaurants reopen). Scans `product_availability_overrides` rows
--   whose `auto_reset_at` has elapsed and restores them to the default
--   "available" state. Use case: chef marks an item out-of-stock in the
--   evening with auto-reset for the next morning; the cron flips it back
--   on automatically, no manual cleanup needed.
--
--   Other cron jobs deliberately NOT added here:
--     - expire_customer_sessions: unnecessary — `expires_at` is a column,
--       RLS already filters on it, there is no "expired" state to flip.
--     - cleanup_old_sessions: premature — volume is negligible for years,
--       and `orders.customer_session_id` has FK ON DELETE RESTRICT, so a
--       naive hard delete would fail. To be revisited if metrics demand it.
--
-- Idempotency:
--   - `ALTER PUBLICATION ... ADD TABLE` raises `duplicate_object` if the
--     table is already in the publication. Each ADD is therefore wrapped
--     in a DO block that consults `pg_publication_tables` first.
--   - `pg_cron` has no `CREATE OR REPLACE`. The pattern is
--     `cron.unschedule` (no-op when the job does not exist) followed by
--     `cron.schedule` to (re)create it from scratch.

BEGIN;

-- =========================================
-- Part A — Realtime publication
-- =========================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customer_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_sessions;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_groups;
  END IF;
END $$;

-- =========================================
-- Part B — pg_cron: daily availability reset
-- =========================================

-- Remove any previous version of the job (no-op on first apply).
SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'daily_reset_availability';

-- (Re)create the job.
SELECT cron.schedule(
  'daily_reset_availability',
  '0 4 * * *',  -- 04:00 UTC every day
  $$
    UPDATE public.product_availability_overrides
    SET
      available = true,
      disabled_at = NULL,
      disabled_reason = NULL,
      auto_reset_at = NULL,
      disabled_by = NULL
    WHERE
      auto_reset_at IS NOT NULL
      AND auto_reset_at <= now();
  $$
);

COMMIT;
