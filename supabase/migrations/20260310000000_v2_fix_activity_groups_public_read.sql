-- =============================================================================
-- Fix: Remove cross-tenant public read exposure from activity group tables
-- =============================================================================
--
-- Tables affected: v2_activity_groups, v2_activity_group_members
-- Tables NOT touched: all others
--
-- Context:
--   Migration 20260302131000_hardening_v2_groups_rls.sql re-created public
--   SELECT policies (USING true) on these two tables. After the Phase 2
--   migration (20260309100000), all write operations are correctly isolated
--   via get_my_tenant_ids(), but the public SELECT policies still allow any
--   anonymous user to enumerate all tenants' activity groups and memberships.
--
--   All other catalog data is now served through SECURITY DEFINER RPCs that
--   bypass RLS. These two tables are the only remaining public read exposure.
--
-- This migration:
--   1. Drops the two public read policies
--   2. Validates that all four tenant-scoped policies remain intact
--   3. Validates that no public read policies survive on either table
--
-- Preserved (untouched):
--   "Tenant select own rows"  (authenticated, get_my_tenant_ids())
--   "Tenant insert own rows"  (authenticated, get_my_tenant_ids())
--   "Tenant update own rows"  (authenticated, get_my_tenant_ids())
--   "Tenant delete own rows"  (authenticated, get_my_tenant_ids())
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: Drop cross-tenant public read policies
-- =============================================================================

DROP POLICY IF EXISTS "Public can read v2_activity_groups"
  ON public.v2_activity_groups;

DROP POLICY IF EXISTS "Public can read v2_activity_group_members"
  ON public.v2_activity_group_members;


-- =============================================================================
-- STEP 2: Validate — tenant-scoped policies must still be present (4 each)
-- =============================================================================

DO $$
DECLARE
  t   text;
  cnt int;
BEGIN
  FOREACH t IN ARRAY ARRAY['v2_activity_groups', 'v2_activity_group_members'] LOOP
    SELECT COUNT(*) INTO cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = t
      AND policyname IN (
            'Tenant select own rows',
            'Tenant insert own rows',
            'Tenant update own rows',
            'Tenant delete own rows'
          );

    IF cnt < 4 THEN
      RAISE EXCEPTION
        'Validation failed: % has only %/4 tenant-scoped policies. Aborting.',
        t, cnt;
    END IF;

    RAISE NOTICE 'Validation passed: % — %/4 tenant-scoped policies confirmed.', t, cnt;
  END LOOP;
END $$;


-- =============================================================================
-- STEP 3: Validate — no public read policies remain on either table
-- =============================================================================

DO $$
DECLARE
  cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  IN ('v2_activity_groups', 'v2_activity_group_members')
    AND policyname LIKE 'Public can read%';

  IF cnt > 0 THEN
    RAISE EXCEPTION
      'Validation failed: % public read policy(ies) still present on activity group tables.',
      cnt;
  END IF;

  RAISE NOTICE 'Validation passed: no public read policies remain on activity group tables.';
END $$;

COMMIT;
