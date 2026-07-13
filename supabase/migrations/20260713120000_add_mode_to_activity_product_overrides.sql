begin;

-- Third visibility state for the realtime "Gestisci visibilità" control.
-- `mode` is meaningful ONLY when `visible_override = false`:
--   'hide'    → product removed from the public catalog (current behavior)
--   'disable' → product kept but rendered as "Non disponibile" (is_disabled: true)
-- When `visible_override IS NULL` or `true`, `mode` is ignored by the resolver.
-- No backfill: existing rows with visible_override = false and mode NULL keep the
-- current "hide" behavior via the resolver fallback (normalizeVisibilityMode).
ALTER TABLE public.activity_product_overrides
  ADD COLUMN IF NOT EXISTS mode text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'activity_product_overrides_mode_check'
  ) THEN
    ALTER TABLE public.activity_product_overrides
      ADD CONSTRAINT activity_product_overrides_mode_check
      CHECK (mode IS NULL OR mode IN ('hide', 'disable'));
  END IF;
END $$;

commit;
