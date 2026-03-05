BEGIN;

ALTER TABLE public.v2_schedules
  ADD COLUMN IF NOT EXISTS visibility_mode text NOT NULL DEFAULT 'hide';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'v2_schedules_visibility_mode_check'
  ) THEN
    ALTER TABLE public.v2_schedules
      ADD CONSTRAINT v2_schedules_visibility_mode_check
      CHECK (visibility_mode IN ('hide', 'disable'));
  END IF;
END
$$;

UPDATE public.v2_schedules
SET visibility_mode = 'hide'
WHERE visibility_mode IS NULL;

COMMIT;
