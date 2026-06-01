-- =========================================
-- RESERVATIONS — Add `source` column
-- =========================================
-- Distinguishes online submissions (public form via `submit-reservation`)
-- from manual entries created by admins via the dashboard.
--
-- Existing rows (all pre-feature) come from the public form → 'online' default
-- is the correct backfill. No separate backfill step needed.
--
-- RLS policies unchanged: this column is not referenced by any policy.

BEGIN;

ALTER TABLE public.reservations
    ADD COLUMN source text NOT NULL DEFAULT 'online'
    CHECK (source IN ('online', 'manual'));

COMMIT;
