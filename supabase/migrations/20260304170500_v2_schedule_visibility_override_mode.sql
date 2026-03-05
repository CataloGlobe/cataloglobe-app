begin;

ALTER TABLE public.v2_schedule_visibility_overrides
  ADD COLUMN IF NOT EXISTS mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'v2_schedule_visibility_overrides_mode_check'
  ) THEN
    ALTER TABLE public.v2_schedule_visibility_overrides
      ADD CONSTRAINT v2_schedule_visibility_overrides_mode_check
      CHECK ((visible = true) OR (mode IN ('hide', 'disable')));
  END IF;
END $$;

-- Legacy rows represented hidden products with visible=false and used schedule-level mode.
UPDATE public.v2_schedule_visibility_overrides
SET mode = 'hide'
WHERE visible = false
  AND mode IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'v2_schedules'
      AND column_name = 'visibility_mode'
  ) THEN
    EXECUTE $sql$
      UPDATE public.v2_schedule_visibility_overrides o
      SET mode = CASE
        WHEN s.visibility_mode = 'disable' THEN 'disable'
        ELSE 'hide'
      END
      FROM public.v2_schedules s
      WHERE o.schedule_id = s.id
        AND o.visible = false
    $sql$;
  END IF;
END $$;

commit;
