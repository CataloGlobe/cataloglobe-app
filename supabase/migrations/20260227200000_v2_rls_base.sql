-- =========================================
-- V2: RLS base hardening (tenant = auth.uid())
-- - Enables RLS on tenant-owned tables
-- - Adds DEFAULT tenant_id = auth.uid() where applicable
-- - Adds tenant policies for authenticated users
-- - Keeps existing "public read" policies for now (public API will be tightened later)
-- =========================================

BEGIN;

-- 0) Helper: ensure tenant_id defaults to auth.uid() on tenant-owned tables
-- (so inserts don't have to manually pass tenant_id)
-- NOTE: this is safe because your tenant_id == auth.uid() model is confirmed.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name LIKE 'v2_%'
  LOOP
    -- set default if not already set (best-effort)
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT auth.uid();', t);
  END LOOP;
END $$;

-- 1) Enable RLS on ALL v2 tables that have tenant_id
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name LIKE 'v2_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;

-- 2) RLS on v2_tenants (no tenant_id): user can only see/manage its own tenant row
ALTER TABLE public.v2_tenants ENABLE ROW LEVEL SECURITY;

-- Drop old tenant policies if present (avoid duplicates)
DROP POLICY IF EXISTS "Tenant can read own tenant" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can update own tenant" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can insert own tenant" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can delete own tenant" ON public.v2_tenants;

CREATE POLICY "Tenant can read own tenant"
ON public.v2_tenants
FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Tenant can update own tenant"
ON public.v2_tenants
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

-- (Optional) allow insert only if id = auth.uid() (useful for onboarding flows)
CREATE POLICY "Tenant can insert own tenant"
ON public.v2_tenants
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());

-- 3) Policies for tenant-owned tables (tenant_id = auth.uid())
-- We create standardized policies. If you already have similar ones with same names, we drop first.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'tenant_id'
      AND table_name LIKE 'v2_%'
  LOOP
    -- Skip: v2_tenants handled separately
    IF t = 'v2_tenants' THEN
      CONTINUE;
    END IF;

    -- Drop if already exists (idempotent)
    EXECUTE format('DROP POLICY IF EXISTS "Tenant select own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant insert own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant update own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant delete own rows" ON public.%I;', t);

    -- Create policies (authenticated only)
    EXECUTE format($sql$
      CREATE POLICY "Tenant select own rows"
      ON public.%I
      FOR SELECT
      TO authenticated
      USING (tenant_id = auth.uid());
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant insert own rows"
      ON public.%I
      FOR INSERT
      TO authenticated
      WITH CHECK (tenant_id = auth.uid());
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant update own rows"
      ON public.%I
      FOR UPDATE
      TO authenticated
      USING (tenant_id = auth.uid())
      WITH CHECK (tenant_id = auth.uid());
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant delete own rows"
      ON public.%I
      FOR DELETE
      TO authenticated
      USING (tenant_id = auth.uid());
    $sql$, t);
  END LOOP;
END $$;

-- 4) v2_allergens: keep public read (system table)
-- ensure RLS enabled (already true in your instance, but make it explicit)
ALTER TABLE public.v2_allergens ENABLE ROW LEVEL SECURITY;

-- Ensure public can read (idempotent)
DROP POLICY IF EXISTS "Public can read v2_allergens" ON public.v2_allergens;
CREATE POLICY "Public can read v2_allergens"
ON public.v2_allergens
FOR SELECT
TO public
USING (true);

COMMIT;