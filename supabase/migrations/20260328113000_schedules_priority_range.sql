BEGIN;

-- Clamp legacy out-of-range values before adding the strict check.
UPDATE public.schedules
SET priority = LEAST(10, GREATEST(1, priority))
WHERE priority < 1 OR priority > 10;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'schedules_priority_range_check'
  ) THEN
    ALTER TABLE public.schedules
      ADD CONSTRAINT schedules_priority_range_check
      CHECK (priority BETWEEN 1 AND 10);
  END IF;
END
$$;

COMMIT;
