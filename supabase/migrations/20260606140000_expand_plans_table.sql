BEGIN;

-- =============================================================================
-- Subscription refactor — Step 1/8: expand `plans` lookup table
-- =============================================================================
--
-- The pre-existing `plans` table (20260316050000) is a minimal lookup with only
-- (code, max_activities, max_products, max_catalogs). It now needs to carry
-- pricing, Stripe price IDs, feature gating, and self-service constraints.
--
-- This migration is additive and idempotent: it only ADDs columns. No rows
-- are inserted or updated here (see Step 2 for seed/upsert of 'base' + 'pro').
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Add columns
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans
    ADD COLUMN IF NOT EXISTS name                       text,
    ADD COLUMN IF NOT EXISTS description                text,
    ADD COLUMN IF NOT EXISTS monthly_price_cents        integer,
    ADD COLUMN IF NOT EXISTS stripe_price_id            text,
    ADD COLUMN IF NOT EXISTS features_json              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS sort_order                 integer     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_public                  boolean     NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS volume_discount_threshold  integer     NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS volume_discount_percent    integer     NOT NULL DEFAULT 10,
    ADD COLUMN IF NOT EXISTS max_self_service_seats     integer     NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS created_at                 timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at                 timestamptz NOT NULL DEFAULT now();

-- ────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraints (idempotent)
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.plans'::regclass
          AND conname  = 'plans_volume_discount_threshold_check'
    ) THEN
        ALTER TABLE public.plans
            ADD CONSTRAINT plans_volume_discount_threshold_check
                CHECK (volume_discount_threshold >= 1);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.plans'::regclass
          AND conname  = 'plans_volume_discount_percent_check'
    ) THEN
        ALTER TABLE public.plans
            ADD CONSTRAINT plans_volume_discount_percent_check
                CHECK (volume_discount_percent BETWEEN 0 AND 100);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.plans'::regclass
          AND conname  = 'plans_monthly_price_cents_check'
    ) THEN
        ALTER TABLE public.plans
            ADD CONSTRAINT plans_monthly_price_cents_check
                CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.plans'::regclass
          AND conname  = 'plans_max_self_service_seats_check'
    ) THEN
        ALTER TABLE public.plans
            ADD CONSTRAINT plans_max_self_service_seats_check
                CHECK (max_self_service_seats >= 1);
    END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS set_updated_at_plans ON public.plans;
CREATE TRIGGER set_updated_at_plans
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. Public read RLS (lookup table — readable by any authenticated user)
--    Mirrors what we will apply to `addons` in Step 6.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read plans" ON public.plans;
CREATE POLICY "Authenticated can read plans"
    ON public.plans FOR SELECT TO authenticated
    USING (true);

-- NOTE: no INSERT/UPDATE/DELETE policies → only service_role can mutate.

-- ────────────────────────────────────────────────────────────────────────────
-- 5. Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    new_col_count int;
BEGIN
    SELECT COUNT(*) INTO new_col_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'plans'
      AND column_name  IN (
          'name','description','monthly_price_cents','stripe_price_id',
          'features_json','sort_order','is_public',
          'volume_discount_threshold','volume_discount_percent',
          'max_self_service_seats','created_at','updated_at'
      );

    IF new_col_count = 12 THEN
        RAISE NOTICE 'OK: all 12 new columns present on plans.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/12 new columns found on plans.', new_col_count;
    END IF;
END $$;

COMMIT;
