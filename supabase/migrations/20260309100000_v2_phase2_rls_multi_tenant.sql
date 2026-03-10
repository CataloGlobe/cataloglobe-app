-- =============================================================================
-- Phase 2: RLS Multi-Tenant Update
-- =============================================================================
--
-- Goal: replace all policies that use tenant_id = auth.uid() (or id = auth.uid()
--       on v2_tenants) with policies based on tenant ownership via a reusable
--       helper function. No schema changes. No frontend changes.
--
-- Approach:
--   1. Create get_my_tenant_ids() helper function
--   2. Replace v2_tenants policies (uses owner_user_id, not tenant_id)
--   3. Replace all standard "Tenant * own rows" policies via dynamic block
--   4. Drop non-standard auth.uid() policies not covered by the dynamic block
--   5. Handle v2_product_attribute_definitions (nullable tenant_id, special SELECT)
--   6. Harden v2_schedule_targets (previously unprotected)
--   7. Validate: no auth.uid() in non-service-role policies; public reads intact
--
-- Policies PRESERVED (untouched by this migration):
--   - "Public can read v2_activity_groups"       (TO public, added by hardening)
--   - "Public can read v2_activity_group_members" (TO public, added by hardening)
--   - "Public can read v2_allergens"             (TO public, system table)
--   - "Service role has full access to catalogs"
--   - "Service role has full access to catalog categories"
--   - "Service role has full access to catalog category products"
--   - "Service role has full access to attribute definitions"
--   - "Service role has full access to attribute values"
--   - "Service role has full access to product allergens"
--
-- Note on public catalog reads:
--   "Public can read v2_*" policies for catalogs, products, styles, schedules,
--   featured_contents etc. were intentionally DROPPED by migration
--   20260227203000_v2_rls_tighten_public_reads.sql. Public catalog access now
--   goes through SECURITY DEFINER RPC functions. Those are not affected here.
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Create helper function get_my_tenant_ids()
-- =============================================================================
--
-- Returns the set of tenant IDs owned by the currently authenticated user.
--
-- SECURITY INVOKER: the function executes as the calling user, so auth.uid()
-- resolves correctly and v2_tenants RLS (owner_user_id = auth.uid()) filters
-- naturally. No infinite recursion: v2_tenants policies use owner_user_id
-- directly (no function call).
--
-- STABLE: PostgreSQL caches the result within a single SQL statement, which
-- is critical for performance when RLS evaluates this for every row in a scan.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT id
  FROM v2_tenants
  WHERE owner_user_id = auth.uid()
$$;


-- =============================================================================
-- STEP 2: Replace v2_tenants policies
-- =============================================================================
--
-- Before (v2_tenants had id = auth.uid()):
--   "Tenant can read own tenant"   USING (id = auth.uid())
--   "Tenant can update own tenant" USING/WITH CHECK (id = auth.uid())
--   "Tenant can insert own tenant" WITH CHECK (id = auth.uid())
--   (no DELETE policy existed)
--
-- After: use owner_user_id = auth.uid() + add missing DELETE policy.
-- =============================================================================

-- Drop old policies (singular form — as named by 20260227200000_v2_rls_base.sql)
DROP POLICY IF EXISTS "Tenant can read own tenant"   ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can update own tenant" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can insert own tenant" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can delete own tenant" ON public.v2_tenants;

-- Drop plural variants in case of any prior partial run
DROP POLICY IF EXISTS "Tenant can read own tenants"   ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can update own tenants" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can insert own tenants" ON public.v2_tenants;
DROP POLICY IF EXISTS "Tenant can delete own tenants" ON public.v2_tenants;

-- Create new policies using owner_user_id
CREATE POLICY "Tenant can read own tenants"
ON public.v2_tenants
FOR SELECT TO authenticated
USING (owner_user_id = auth.uid());

CREATE POLICY "Tenant can insert own tenants"
ON public.v2_tenants
FOR INSERT TO authenticated
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Tenant can update own tenants"
ON public.v2_tenants
FOR UPDATE TO authenticated
USING  (owner_user_id = auth.uid())
WITH CHECK (owner_user_id = auth.uid());

CREATE POLICY "Tenant can delete own tenants"
ON public.v2_tenants
FOR DELETE TO authenticated
USING (owner_user_id = auth.uid());


-- =============================================================================
-- STEP 3: Replace standard policies on all tenant-scoped tables
-- =============================================================================
--
-- The RLS base migration (20260227200000) created four named policies on every
-- v2_* table that has a tenant_id column:
--
--   "Tenant select own rows" — SELECT USING (tenant_id = auth.uid())
--   "Tenant insert own rows" — INSERT WITH CHECK (tenant_id = auth.uid())
--   "Tenant update own rows" — UPDATE USING/WITH CHECK (tenant_id = auth.uid())
--   "Tenant delete own rows" — DELETE USING (tenant_id = auth.uid())
--
-- This block drops and recreates those four policies on every qualifying table,
-- excluding v2_tenants (handled above) and v2_product_attribute_definitions
-- (handled in Step 5 due to nullable tenant_id).
--
-- Dropping a non-existent policy (DROP POLICY IF EXISTS) is safe.
-- The dynamic block covers all tables found in information_schema at runtime,
-- including v2_product_option_groups, v2_product_groups, etc. whose creation
-- files are empty stubs but which are confirmed to exist in the live database.
-- =============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT DISTINCT c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name  = 'tenant_id'
      AND c.table_name LIKE 'v2_%'
      AND c.table_name NOT IN (
        'v2_tenants',                       -- handled in Step 2
        'v2_product_attribute_definitions'  -- handled in Step 5
      )
    ORDER BY c.table_name
  LOOP
    -- Drop standard policies from the RLS base migration
    EXECUTE format('DROP POLICY IF EXISTS "Tenant select own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant insert own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant update own rows" ON public.%I;', t);
    EXECUTE format('DROP POLICY IF EXISTS "Tenant delete own rows" ON public.%I;', t);

    -- Recreate using get_my_tenant_ids()
    EXECUTE format($sql$
      CREATE POLICY "Tenant select own rows"
      ON public.%I
      FOR SELECT TO authenticated
      USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant insert own rows"
      ON public.%I
      FOR INSERT TO authenticated
      WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant update own rows"
      ON public.%I
      FOR UPDATE TO authenticated
      USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));
    $sql$, t);

    EXECUTE format($sql$
      CREATE POLICY "Tenant delete own rows"
      ON public.%I
      FOR DELETE TO authenticated
      USING (tenant_id IN (SELECT public.get_my_tenant_ids()));
    $sql$, t);

    RAISE NOTICE 'Replaced RLS policies on public.%', t;
  END LOOP;
END $$;


-- =============================================================================
-- STEP 4: Drop non-standard auth.uid() policies not covered by Step 3
-- =============================================================================
--
-- Migration 20260302131000_hardening_v2_groups_rls.sql created FOR ALL policies
-- with non-standard names on the activity group tables. These coexisted with
-- the standard "Tenant * own rows" policies (both enforcing auth.uid() check).
-- Step 3 replaced the standard policies; these must be explicitly dropped.
--
-- After this step, the only policies on v2_activity_groups are:
--   - "Public can read v2_activity_groups"  (TO public, USING true) — KEPT
--   - "Tenant select own rows"              (new, uses get_my_tenant_ids())
--   - "Tenant insert own rows"              (new, uses get_my_tenant_ids())
--   - "Tenant update own rows"              (new, uses get_my_tenant_ids())
--   - "Tenant delete own rows"              (new, uses get_my_tenant_ids())
-- =============================================================================

-- v2_activity_groups: drop FOR ALL management policy from hardening migration
DROP POLICY IF EXISTS "Users can manage their own activity groups"
  ON public.v2_activity_groups;

-- v2_activity_group_members: drop FOR ALL management policy from hardening migration
DROP POLICY IF EXISTS "Users can manage their own group members"
  ON public.v2_activity_group_members;


-- =============================================================================
-- STEP 5: v2_product_attribute_definitions (nullable tenant_id — special case)
-- =============================================================================
--
-- After migration 20260306000000_attribute_governance.sql, tenant_id is NULLABLE:
--   - tenant_id = NULL  → platform-level attribute (readable by all tenants)
--   - tenant_id = uuid  → tenant-specific attribute (only readable by that tenant)
--
-- Current policies (from dynamic base block + attribute_governance):
--   "Tenant select own rows"          USING (tenant_id = auth.uid())
--   "tenant_select_attribute_definitions" USING (tenant_id IS NULL OR tenant_id = auth.uid())
--   "Tenant insert own rows"          WITH CHECK (tenant_id = auth.uid())
--   "Tenant update own rows"          USING/WITH CHECK (tenant_id = auth.uid())
--   "Tenant delete own rows"          USING (tenant_id = auth.uid())
--
-- Note: "Tenants can manage their own attribute definitions" was already dropped
-- by 20260227203000_v2_rls_tighten_public_reads.sql.
-- Note: "Service role has full access to attribute definitions" is NOT touched.
-- =============================================================================

DROP POLICY IF EXISTS "Tenant select own rows"
  ON public.v2_product_attribute_definitions;

DROP POLICY IF EXISTS "tenant_select_attribute_definitions"
  ON public.v2_product_attribute_definitions;

DROP POLICY IF EXISTS "Tenant insert own rows"
  ON public.v2_product_attribute_definitions;

DROP POLICY IF EXISTS "Tenant update own rows"
  ON public.v2_product_attribute_definitions;

DROP POLICY IF EXISTS "Tenant delete own rows"
  ON public.v2_product_attribute_definitions;

-- Guard: drop original FOR ALL policy in case it survived tighten in some envs
DROP POLICY IF EXISTS "Tenants can manage their own attribute definitions"
  ON public.v2_product_attribute_definitions;

-- SELECT: platform attributes (tenant_id IS NULL) are visible to all authenticated
--         users; tenant-specific attributes are visible only to owning tenant.
CREATE POLICY "Tenant select own rows"
ON public.v2_product_attribute_definitions
FOR SELECT TO authenticated
USING (
  tenant_id IS NULL
  OR tenant_id IN (SELECT public.get_my_tenant_ids())
);

-- INSERT: callers can only create attributes for their own tenants.
--         Platform attributes (tenant_id = NULL) can only be inserted by service_role.
CREATE POLICY "Tenant insert own rows"
ON public.v2_product_attribute_definitions
FOR INSERT TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- UPDATE: same scope as insert
CREATE POLICY "Tenant update own rows"
ON public.v2_product_attribute_definitions
FOR UPDATE TO authenticated
USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- DELETE: same scope
CREATE POLICY "Tenant delete own rows"
ON public.v2_product_attribute_definitions
FOR DELETE TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));


-- =============================================================================
-- STEP 6: Harden v2_schedule_targets (previously unprotected)
-- =============================================================================
--
-- v2_schedule_targets was created in 20260304120000_v2_schedule_targets.sql
-- AFTER the dynamic RLS base block ran. It has no tenant_id column, no RLS
-- enabled, and no policies — data was unprotected.
--
-- Access control is derived through the parent schedule's tenant_id:
--   schedule_id must belong to a schedule owned by the caller's tenant.
--
-- The public catalog resolver predates this table (created 20260227231000) and
-- does not query it. Runtime evaluation uses SECURITY DEFINER functions that
-- bypass RLS. No public read policy is needed.
-- =============================================================================

ALTER TABLE public.v2_schedule_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant select own schedule targets"
ON public.v2_schedule_targets
FOR SELECT TO authenticated
USING (
  schedule_id IN (
    SELECT id FROM public.v2_schedules
    WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "Tenant insert own schedule targets"
ON public.v2_schedule_targets
FOR INSERT TO authenticated
WITH CHECK (
  schedule_id IN (
    SELECT id FROM public.v2_schedules
    WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "Tenant update own schedule targets"
ON public.v2_schedule_targets
FOR UPDATE TO authenticated
USING (
  schedule_id IN (
    SELECT id FROM public.v2_schedules
    WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
  )
)
WITH CHECK (
  schedule_id IN (
    SELECT id FROM public.v2_schedules
    WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);

CREATE POLICY "Tenant delete own schedule targets"
ON public.v2_schedule_targets
FOR DELETE TO authenticated
USING (
  schedule_id IN (
    SELECT id FROM public.v2_schedules
    WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
  )
);


-- =============================================================================
-- STEP 7: Validation
-- =============================================================================

-- 7a. Check that no non-service-role policy still references auth.uid() directly.
--
--     pg_policies.qual and with_check hold the reconstructed USING / WITH CHECK
--     expressions as text. A LIKE match on '%auth.uid%' catches all call forms.
--     Service-role policies are excluded (they legitimately use USING (true)).
--
--     Result is a WARNING (not EXCEPTION) to allow inspection without rollback.
DO $$
DECLARE
  r              record;
  remaining_count int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd, qual, with_check
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  LIKE 'v2_%'
      AND  (
             qual       LIKE '%auth.uid%'
          OR with_check LIKE '%auth.uid%'
           )
      AND  NOT ('service_role' = ANY(roles))
    ORDER BY tablename, policyname
  LOOP
    RAISE WARNING
      'auth.uid() still referenced — table: %, policy: %, cmd: %',
      r.tablename, r.policyname, r.cmd;
    remaining_count := remaining_count + 1;
  END LOOP;

  IF remaining_count = 0 THEN
    RAISE NOTICE
      'Validation 7a PASSED: no non-service-role v2_* policy references auth.uid() directly.';
  ELSE
    RAISE WARNING
      'Validation 7a: % policy(ies) still reference auth.uid(). Review warnings above.',
      remaining_count;
  END IF;
END $$;


-- 7b. Verify the three public read policies that must still exist.
--
--     Context: 20260227203000_v2_rls_tighten_public_reads.sql dropped most
--     public read policies (replaced by SECURITY DEFINER RPCs).
--     Only v2_activity_groups, v2_activity_group_members were re-added by
--     20260302131000_hardening_v2_groups_rls.sql.
--     v2_allergens has its own public policy that was never dropped.
DO $$
DECLARE
  pair         text[];
  required     text[][] := ARRAY[
    ARRAY['v2_activity_groups',        'Public can read v2_activity_groups'],
    ARRAY['v2_activity_group_members', 'Public can read v2_activity_group_members'],
    ARRAY['v2_allergens',              'Public can read v2_allergens']
  ];
  found_count  int;
  missing      int := 0;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY required LOOP
    SELECT COUNT(*) INTO found_count
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = pair[1]
      AND  policyname = pair[2];

    IF found_count = 0 THEN
      RAISE WARNING
        'Validation 7b: expected public read policy missing — table: %, policy: %',
        pair[1], pair[2];
      missing := missing + 1;
    END IF;
  END LOOP;

  IF missing = 0 THEN
    RAISE NOTICE 'Validation 7b PASSED: all required public read policies are present.';
  END IF;
END $$;


-- 7c. Verify service_role bypass policies are preserved.
DO $$
DECLARE
  pair         text[];
  required     text[][] := ARRAY[
    ARRAY['v2_catalogs',                     'Service role has full access to catalogs'],
    ARRAY['v2_catalog_categories',           'Service role has full access to catalog categories'],
    ARRAY['v2_catalog_category_products',    'Service role has full access to catalog category products'],
    ARRAY['v2_product_attribute_definitions','Service role has full access to attribute definitions'],
    ARRAY['v2_product_attribute_values',     'Service role has full access to attribute values'],
    ARRAY['v2_product_allergens',            'Service role has full access to product allergens']
  ];
  found_count  int;
  missing      int := 0;
BEGIN
  FOREACH pair SLICE 1 IN ARRAY required LOOP
    SELECT COUNT(*) INTO found_count
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = pair[1]
      AND  policyname = pair[2];

    IF found_count = 0 THEN
      RAISE WARNING
        'Validation 7c: service_role policy missing — table: %, policy: %',
        pair[1], pair[2];
      missing := missing + 1;
    END IF;
  END LOOP;

  IF missing = 0 THEN
    RAISE NOTICE 'Validation 7c PASSED: all service_role bypass policies are present.';
  END IF;
END $$;


-- 7d. Verify v2_tenants policies no longer use the old id = auth.uid() pattern.
DO $$
DECLARE
  old_count int;
BEGIN
  SELECT COUNT(*) INTO old_count
  FROM   pg_policies
  WHERE  schemaname = 'public'
    AND  tablename  = 'v2_tenants'
    AND  (qual LIKE '%id = auth.uid()%' OR with_check LIKE '%id = auth.uid()%');

  IF old_count = 0 THEN
    RAISE NOTICE 'Validation 7d PASSED: v2_tenants has no id = auth.uid() policies remaining.';
  ELSE
    RAISE WARNING
      'Validation 7d: % v2_tenants policy(ies) still use id = auth.uid(). '
      'Migration may not have applied correctly.',
      old_count;
  END IF;
END $$;


-- 7e. Verify v2_schedule_targets now has RLS enabled.
DO $$
DECLARE
  rls_on boolean;
BEGIN
  SELECT relrowsecurity INTO rls_on
  FROM   pg_class
  WHERE  relname      = 'v2_schedule_targets'
    AND  relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF rls_on IS TRUE THEN
    RAISE NOTICE 'Validation 7e PASSED: v2_schedule_targets has RLS enabled.';
  ELSE
    RAISE EXCEPTION
      'Validation 7e FAILED: v2_schedule_targets does not have RLS enabled.';
  END IF;
END $$;


-- 7f. Verify get_my_tenant_ids() function exists.
DO $$
DECLARE
  fn_count int;
BEGIN
  SELECT COUNT(*) INTO fn_count
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'get_my_tenant_ids';

  IF fn_count > 0 THEN
    RAISE NOTICE 'Validation 7f PASSED: public.get_my_tenant_ids() exists.';
  ELSE
    RAISE EXCEPTION 'Validation 7f FAILED: public.get_my_tenant_ids() not found.';
  END IF;
END $$;

COMMIT;
