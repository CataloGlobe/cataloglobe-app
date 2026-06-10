-- Migration: 20260609120000_activities_feature_gating
-- Changes DEFAULT ordering_enabled -> false and adds trigger to block enabling
-- Pro-only features (table_ordering, table_reservation) without the feature in plan.
-- Semantics: blocks transition to true only; grandfathers existing true values.

-- ============================================================
-- 1. Change DEFAULT ordering_enabled -> false
-- ============================================================
ALTER TABLE public.activities
  ALTER COLUMN ordering_enabled SET DEFAULT false;


-- ============================================================
-- 2. Trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_activity_feature_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Block ordering_enabled: false -> true without table_ordering feature
  IF NEW.ordering_enabled IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.ordering_enabled IS DISTINCT FROM TRUE)
     AND public.activity_has_feature(NEW.id, 'table_ordering') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE: table_ordering'
      USING ERRCODE = 'P0001';
  END IF;

  -- Block enable_reservations: false -> true without table_reservation feature
  IF NEW.enable_reservations IS TRUE
     AND (TG_OP = 'INSERT' OR OLD.enable_reservations IS DISTINCT FROM TRUE)
     AND public.activity_has_feature(NEW.id, 'table_reservation') IS NOT TRUE
  THEN
    RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE: table_reservation'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 3. Trigger (idempotent)
-- ============================================================
DROP TRIGGER IF EXISTS trg_check_activity_feature_flags ON public.activities;

CREATE TRIGGER trg_check_activity_feature_flags
  BEFORE INSERT OR UPDATE OF ordering_enabled, enable_reservations
  ON public.activities
  FOR EACH ROW
  EXECUTE FUNCTION public.check_activity_feature_flags();


-- ============================================================
-- 4. Validation block
-- ============================================================
DO $$
DECLARE
  v_func_exists   boolean;
  v_trigger_exists boolean;
  v_default_val   text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'check_activity_feature_flags'
  ) INTO v_func_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'activities'
      AND t.tgname = 'trg_check_activity_feature_flags'
  ) INTO v_trigger_exists;

  SELECT column_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'activities'
    AND column_name  = 'ordering_enabled'
  INTO v_default_val;

  IF NOT v_func_exists THEN
    RAISE EXCEPTION 'Validation failed: function check_activity_feature_flags not found';
  END IF;

  IF NOT v_trigger_exists THEN
    RAISE EXCEPTION 'Validation failed: trigger trg_check_activity_feature_flags not found on activities';
  END IF;

  IF v_default_val IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'Validation failed: ordering_enabled DEFAULT is "%" (expected "false")', v_default_val;
  END IF;

  RAISE NOTICE 'OK: migration 20260609120000 validated successfully';
END;
$$;
