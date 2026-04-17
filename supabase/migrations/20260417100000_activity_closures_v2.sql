-- 20260417100000_activity_closures_v2.sql
-- Evolve activity_closures: JSONB slots, end_date range, drop scalar opens_at/closes_at

BEGIN;

-- 1. Add new columns first (before backfill, before dropping old ones)
ALTER TABLE activity_closures ADD COLUMN IF NOT EXISTS slots JSONB NULL;
ALTER TABLE activity_closures ADD COLUMN IF NOT EXISTS end_date DATE NULL;

-- 2. Backfill slots from existing opens_at/closes_at (only for special-hours rows)
UPDATE activity_closures
SET slots = jsonb_build_array(
    jsonb_build_object(
        'opens_at', to_char(opens_at, 'HH24:MI'),
        'closes_at', to_char(closes_at, 'HH24:MI')
    )
)
WHERE is_closed = false
  AND opens_at IS NOT NULL
  AND closes_at IS NOT NULL;

-- 3. Drop old time-coherence constraint
ALTER TABLE activity_closures DROP CONSTRAINT IF EXISTS activity_closures_time_coherence;

-- 4. Drop old scalar columns
ALTER TABLE activity_closures DROP COLUMN IF EXISTS opens_at;
ALTER TABLE activity_closures DROP COLUMN IF EXISTS closes_at;

-- 5. Add new constraints
ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_slots_coherence CHECK (
        (is_closed = true AND slots IS NULL)
        OR
        (is_closed = false AND slots IS NOT NULL AND jsonb_array_length(slots) > 0)
    );

ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_date_range CHECK (
        end_date IS NULL OR end_date > closure_date
    );

ALTER TABLE activity_closures
    ADD CONSTRAINT activity_closures_range_must_be_closed CHECK (
        end_date IS NULL OR is_closed = true
    );

COMMIT;
