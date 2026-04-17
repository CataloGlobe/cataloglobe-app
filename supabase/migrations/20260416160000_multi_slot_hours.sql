-- Migration: multi_slot_hours
-- Adds support for multiple time slots per day in activity_hours,
-- moves hours_public flag from activity_hours to activities.

BEGIN;

-- 1. Data cleanup: fix rows that would violate the new time coherence CHECK.
--    If is_closed = false but times are missing or invalid, mark as closed.
UPDATE activity_hours
SET is_closed = true,
    opens_at  = NULL,
    closes_at = NULL
WHERE is_closed = false
  AND (
    opens_at IS NULL
    OR closes_at IS NULL
    OR closes_at <= opens_at
  );

-- 2. Drop old UNIQUE constraint (activity_id, day_of_week)
ALTER TABLE activity_hours
  DROP CONSTRAINT IF EXISTS activity_hours_activity_id_day_of_week_key;

-- 3. Add slot_index column (existing rows default to 0)
ALTER TABLE activity_hours
  ADD COLUMN slot_index SMALLINT NOT NULL DEFAULT 0;

-- 4. Add new UNIQUE constraint (activity_id, day_of_week, slot_index)
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_activity_day_slot_key
  UNIQUE (activity_id, day_of_week, slot_index);

-- 5. Add CHECK constraint on slot_index range [0, 10)
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_slot_index_range
  CHECK (slot_index >= 0 AND slot_index < 10);

-- 6. Add CHECK constraint for time coherence
ALTER TABLE activity_hours
  ADD CONSTRAINT activity_hours_time_coherence
  CHECK (
    (is_closed = true AND opens_at IS NULL AND closes_at IS NULL)
    OR
    (is_closed = false AND opens_at IS NOT NULL AND closes_at IS NOT NULL AND closes_at > opens_at)
  );

-- 7. Add hours_public column to activities
ALTER TABLE activities
  ADD COLUMN hours_public BOOLEAN NOT NULL DEFAULT false;

-- 8. Backfill hours_public on activities from activity_hours
UPDATE activities a
SET hours_public = true
WHERE EXISTS (
  SELECT 1
  FROM activity_hours ah
  WHERE ah.activity_id = a.id
    AND ah.hours_public = true
);

-- 9. Drop hours_public column from activity_hours
ALTER TABLE activity_hours
  DROP COLUMN hours_public;

COMMIT;
