BEGIN;

-- =============================================================================
-- V2: Plans table and FK from v2_tenants.plan
-- =============================================================================
--
-- Creates a lookup table that defines usage limits per plan code.
-- NULL limits mean unlimited.
--
-- The plan codes ('free', 'pro', 'enterprise') match the CHECK constraint
-- already present on v2_tenants.plan (20260316020000). The FK reinforces this
-- at the relational level and makes limits queryable via a join.
--
-- Existing tenant rows are unaffected: all have plan = 'free' (the default),
-- which matches the row inserted here.
-- =============================================================================


-- =============================================================================
-- STEP 1: Plans table
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_plans (
    code           text    PRIMARY KEY,
    max_activities integer,           -- NULL = unlimited
    max_products   integer,           -- NULL = unlimited
    max_catalogs   integer            -- NULL = unlimited
);


-- =============================================================================
-- STEP 2: Seed default plans
-- =============================================================================

INSERT INTO public.v2_plans (code, max_activities, max_products, max_catalogs)
VALUES
    ('free',       1,    20,   1),
    ('pro',        10,   500,  NULL),
    ('enterprise', NULL, NULL, NULL)
ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- STEP 3: Foreign key v2_tenants.plan → v2_plans.code
-- =============================================================================
--
-- Added after the seed so the FK is never temporarily violated during apply.
-- Existing tenant rows all carry plan = 'free', which is present in v2_plans.

ALTER TABLE public.v2_tenants
    ADD CONSTRAINT v2_tenants_plan_fkey
        FOREIGN KEY (plan) REFERENCES public.v2_plans(code);


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
    plan_count int;
    fk_exists  boolean;
BEGIN
    -- All three plan rows present
    SELECT COUNT(*) INTO plan_count
    FROM public.v2_plans
    WHERE code IN ('free', 'pro', 'enterprise');

    IF plan_count = 3 THEN
        RAISE NOTICE 'OK: all 3 plan rows present in v2_plans.';
    ELSE
        RAISE EXCEPTION 'FAIL: only %/3 plan rows found in v2_plans.', plan_count;
    END IF;

    -- Limits are correct for 'free'
    PERFORM 1 FROM public.v2_plans
    WHERE code = 'free' AND max_activities = 1
      AND max_products = 20 AND max_catalogs = 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: free plan limits are incorrect.';
    END IF;
    RAISE NOTICE 'OK: free plan limits correct (activities=1, products=20, catalogs=1).';

    -- Limits are correct for 'pro'
    PERFORM 1 FROM public.v2_plans
    WHERE code = 'pro' AND max_activities = 10
      AND max_products = 500 AND max_catalogs IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: pro plan limits are incorrect.';
    END IF;
    RAISE NOTICE 'OK: pro plan limits correct (activities=10, products=500, catalogs=unlimited).';

    -- enterprise is all NULL
    PERFORM 1 FROM public.v2_plans
    WHERE code = 'enterprise'
      AND max_activities IS NULL
      AND max_products   IS NULL
      AND max_catalogs   IS NULL;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'FAIL: enterprise plan limits are incorrect.';
    END IF;
    RAISE NOTICE 'OK: enterprise plan is fully unlimited.';

    -- FK exists
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
         AND rc.constraint_schema = tc.constraint_schema
        WHERE tc.constraint_schema = 'public'
          AND tc.table_name        = 'v2_tenants'
          AND tc.constraint_name   = 'v2_tenants_plan_fkey'
          AND tc.constraint_type   = 'FOREIGN KEY'
    ) INTO fk_exists;

    IF fk_exists THEN
        RAISE NOTICE 'OK: FK v2_tenants.plan → v2_plans.code exists.';
    ELSE
        RAISE EXCEPTION 'FAIL: FK v2_tenants_plan_fkey not found on v2_tenants.';
    END IF;
END $$;


COMMIT;
