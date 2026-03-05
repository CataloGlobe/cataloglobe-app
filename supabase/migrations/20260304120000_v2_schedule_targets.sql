BEGIN;

-- =========================================
-- V2: SCHEDULE TARGETS (multi-target support)
-- =========================================

-- 1. New join table for multi-target association
CREATE TABLE IF NOT EXISTS public.v2_schedule_targets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id  uuid NOT NULL REFERENCES public.v2_schedules(id) ON DELETE CASCADE,
  target_type  text NOT NULL CHECK (target_type IN ('activity', 'activity_group')),
  target_id    uuid NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS v2_schedule_targets_schedule_id_idx
  ON public.v2_schedule_targets (schedule_id);

CREATE UNIQUE INDEX IF NOT EXISTS v2_schedule_targets_unique_idx
  ON public.v2_schedule_targets (schedule_id, target_type, target_id);

-- 2. Add apply_to_all flag directly on schedules
ALTER TABLE public.v2_schedules
  ADD COLUMN IF NOT EXISTS apply_to_all boolean NOT NULL DEFAULT false;

-- 3. Backfill: mark apply_to_all for rules targeting the system activity group
UPDATE public.v2_schedules s
SET    apply_to_all = true
FROM   public.v2_activity_groups g
WHERE  s.target_type = 'activity_group'
  AND  s.target_id   = g.id
  AND  g.is_system   = true;

-- 4. Backfill: copy existing single targets into the join table
--    (exclude rows that are now apply_to_all, they have no specific targets)
INSERT INTO public.v2_schedule_targets (schedule_id, target_type, target_id)
SELECT s.id, s.target_type, s.target_id
FROM   public.v2_schedules s
WHERE  s.apply_to_all = false
  AND  s.target_type IN ('activity', 'activity_group')
ON CONFLICT DO NOTHING;

COMMIT;
