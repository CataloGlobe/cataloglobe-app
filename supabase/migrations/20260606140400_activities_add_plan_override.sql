BEGIN;

-- =============================================================================
-- Subscription refactor — Step 5/8: activities.plan_override
-- =============================================================================
--
-- Adds a nullable FK on plans(code) to allow per-activity plan override.
-- All rows stay NULL today (effective plan = tenant.plan). When an enterprise
-- customer needs a Pro override on one location, the override is set manually.
--
-- The feature gating helper (Step 8) resolves COALESCE(a.plan_override, t.plan)
-- as the effective plan.
-- =============================================================================

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS plan_override text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.activities'::regclass
          AND conname  = 'activities_plan_override_fkey'
    ) THEN
        ALTER TABLE public.activities
            ADD CONSTRAINT activities_plan_override_fkey
                FOREIGN KEY (plan_override) REFERENCES public.plans(code);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_activities_plan_override
    ON public.activities (plan_override)
    WHERE plan_override IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    col_exists  boolean;
    fk_exists   boolean;
    null_count  int;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'activities'
          AND column_name  = 'plan_override'
    ) INTO col_exists;

    IF NOT col_exists THEN
        RAISE EXCEPTION 'FAIL: activities.plan_override missing.';
    END IF;
    RAISE NOTICE 'OK: activities.plan_override present.';

    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.activities'::regclass
          AND conname  = 'activities_plan_override_fkey'
    ) INTO fk_exists;

    IF NOT fk_exists THEN
        RAISE EXCEPTION 'FAIL: activities_plan_override_fkey missing.';
    END IF;
    RAISE NOTICE 'OK: FK activities.plan_override → plans.code.';

    SELECT COUNT(*) INTO null_count FROM public.activities WHERE plan_override IS NOT NULL;
    IF null_count > 0 THEN
        RAISE NOTICE 'INFO: % activities already carry plan_override.', null_count;
    ELSE
        RAISE NOTICE 'OK: all activities have plan_override = NULL (expected).';
    END IF;
END $$;

COMMIT;
