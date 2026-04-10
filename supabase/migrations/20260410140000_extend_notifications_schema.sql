BEGIN;

-- =============================================================================
-- MIGRATION: extend v2_notifications schema
-- =============================================================================
--
-- Extends the existing v2_notifications table with:
--   - title      (text, nullable)        — short notification heading
--   - message    (text, nullable)        — notification body / description
--   - type       (text, NOT NULL)        — category enum for UI grouping
--
-- Existing columns (event_type, data, read_at) are untouched.
-- The new `type` field is a coarser category; `event_type` stays as the
-- granular event identifier for backward compatibility.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.v2_notifications
    ADD COLUMN IF NOT EXISTS title   text,
    ADD COLUMN IF NOT EXISTS message text,
    ADD COLUMN IF NOT EXISTS type    text NOT NULL DEFAULT 'system';

-- -----------------------------------------------------------------------------
-- 2. CHECK constraint on type
-- -----------------------------------------------------------------------------

ALTER TABLE public.v2_notifications
    DROP CONSTRAINT IF EXISTS v2_notifications_type_check;

ALTER TABLE public.v2_notifications
    ADD CONSTRAINT v2_notifications_type_check
    CHECK (type IN ('system', 'promo', 'info', 'invite', 'warning', 'ownership'));

-- -----------------------------------------------------------------------------
-- 3. Backfill existing rows
-- -----------------------------------------------------------------------------

UPDATE public.v2_notifications
SET type = CASE
    WHEN event_type = 'ownership_received' THEN 'ownership'
    ELSE 'system'
END
WHERE type = 'system';

-- -----------------------------------------------------------------------------
-- 4. Index on (user_id, type, created_at DESC)
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS v2_notifications_user_type_idx
    ON public.v2_notifications (user_id, type, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. DELETE policy (was missing from original migration)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can delete own notifications" ON public.v2_notifications;

CREATE POLICY "Users can delete own notifications"
    ON public.v2_notifications
    FOR DELETE
    USING (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6. Enable Realtime
-- -----------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_notifications;

COMMIT;
