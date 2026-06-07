BEGIN;

-- =============================================================================
-- Subscription refactor — Step 3/8: relax tenants.plan CHECK + change default
-- =============================================================================
--
-- Pre-state (after 20260411100000):
--   CHECK (plan IN ('pro'))         constraint name: tenants_plan_check
--   DEFAULT 'pro'
--
-- Post-state:
--   CHECK (plan IN ('base', 'pro')) constraint name: tenants_plan_check (recreated)
--   DEFAULT 'base'
--
-- Backfill of existing tenants → 'pro' was performed in Step 2.
-- Wizard will explicitly pass plan in the INSERT going forward — DB default
-- 'base' applies only to manually-inserted rows or rows missing plan.
-- =============================================================================

ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE public.tenants
    ADD CONSTRAINT tenants_plan_check
        CHECK (plan IN ('base', 'pro'));

ALTER TABLE public.tenants ALTER COLUMN plan SET DEFAULT 'base';

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    constraint_def text;
    col_default    text;
BEGIN
    SELECT pg_get_constraintdef(c.oid)
      INTO constraint_def
      FROM pg_constraint c
     WHERE c.conrelid = 'public.tenants'::regclass
       AND c.conname  = 'tenants_plan_check';

    IF constraint_def IS NULL THEN
        RAISE EXCEPTION 'FAIL: tenants_plan_check constraint missing.';
    END IF;

    IF constraint_def ILIKE '%base%' AND constraint_def ILIKE '%pro%' THEN
        RAISE NOTICE 'OK: tenants_plan_check accepts base + pro (%).', constraint_def;
    ELSE
        RAISE EXCEPTION 'FAIL: tenants_plan_check unexpected definition: %', constraint_def;
    END IF;

    SELECT column_default
      INTO col_default
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'tenants'
       AND column_name  = 'plan';

    IF col_default ILIKE '%base%' THEN
        RAISE NOTICE 'OK: tenants.plan default is base (%).', col_default;
    ELSE
        RAISE EXCEPTION 'FAIL: tenants.plan default not base, found: %', col_default;
    END IF;
END $$;

COMMIT;
