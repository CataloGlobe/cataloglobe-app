BEGIN;

-- =============================================================================
-- Subscription refactor — Step 6/8: addons lookup table (empty, scaffold only)
-- =============================================================================
--
-- Schema-only: no rows seeded. Add-ons (SMS notifications, custom integrations,
-- etc.) will be defined later when the marketplace UI ships. Today this table
-- exists only so future migrations and the gating helper have a known shape.
--
-- Naming: `addons.id` is text PK (human-readable code like 'sms_notifications'),
-- mirroring `plans.code`. RLS pattern mirrors `plans`: any authenticated user
-- can read; writes go through service_role only.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.addons (
    id                  text        PRIMARY KEY,
    name                text        NOT NULL,
    description         text,
    monthly_price_cents integer,
    stripe_price_id     text,
    is_active           boolean     NOT NULL DEFAULT true,
    sort_order          integer     NOT NULL DEFAULT 0,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.addons'::regclass
          AND conname  = 'addons_monthly_price_cents_check'
    ) THEN
        ALTER TABLE public.addons
            ADD CONSTRAINT addons_monthly_price_cents_check
                CHECK (monthly_price_cents IS NULL OR monthly_price_cents >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.addons'::regclass
          AND conname  = 'addons_id_not_empty'
    ) THEN
        ALTER TABLE public.addons
            ADD CONSTRAINT addons_id_not_empty
                CHECK (length(trim(id)) > 0);
    END IF;
END $$;

DROP TRIGGER IF EXISTS set_updated_at_addons ON public.addons;
CREATE TRIGGER set_updated_at_addons
    BEFORE UPDATE ON public.addons
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS — public read for any authenticated user, no client writes.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read addons" ON public.addons;
CREATE POLICY "Authenticated can read addons"
    ON public.addons FOR SELECT TO authenticated
    USING (true);

-- NOTE: no INSERT/UPDATE/DELETE policies → only service_role can mutate.

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'addons'
    ) THEN
        RAISE EXCEPTION 'FAIL: addons table not created.';
    END IF;
    RAISE NOTICE 'OK: addons table present.';

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'addons'
          AND policyname = 'Authenticated can read addons'
    ) THEN
        RAISE EXCEPTION 'FAIL: read policy on addons missing.';
    END IF;
    RAISE NOTICE 'OK: addons read policy present.';
END $$;

COMMIT;
