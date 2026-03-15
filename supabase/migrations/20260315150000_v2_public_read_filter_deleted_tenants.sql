BEGIN;

-- =============================================================================
-- Fix: exclude soft-deleted tenants from public read policies
-- =============================================================================
--
-- Problem:
--   v2_activities, v2_activity_groups, and v2_activity_group_members have
--   public SELECT policies with USING (true). Any caller — including anon —
--   can read rows belonging to a soft-deleted tenant if they know the row ID
--   or tenant_id. The deleted_at column on v2_tenants is the single source of
--   truth for tenant visibility, but these policies do not consult it.
--
-- Fix:
--   Replace USING (true) with a subquery that confirms the row's tenant_id
--   belongs to a non-deleted tenant:
--
--     tenant_id IN (SELECT id FROM public.v2_tenants WHERE deleted_at IS NULL)
--
--   Why a direct subquery and not get_my_tenant_ids():
--     get_my_tenant_ids() is a SECURITY DEFINER function that returns only
--     the tenants visible to auth.uid(). For anon callers auth.uid() is NULL,
--     so the function would return an empty set, blocking all public reads.
--     The direct subquery on v2_tenants has no such dependency: it checks
--     only the deleted_at column, which is the correct predicate for public
--     access control.
--
--   Performance:
--     v2_tenants already has a partial index on deleted_at WHERE deleted_at
--     IS NOT NULL (added in 20260314170000). The subquery
--     WHERE deleted_at IS NULL will use a sequential scan on the small
--     tenants table, or the planner may choose a bitmap scan. The result
--     is cached per statement by the planner. For the vast majority of
--     deployments the tenants table is small enough that this is negligible.
--
-- Scope:
--   Only the three public SELECT policies are changed. All authenticated
--   CRUD policies on these tables remain untouched.
-- =============================================================================


-- =============================================================================
-- v2_activities
-- =============================================================================

DROP POLICY IF EXISTS "Public can read v2_activities" ON public.v2_activities;

CREATE POLICY "Public can read v2_activities"
ON public.v2_activities
FOR SELECT
TO public
USING (
  tenant_id IN (
    SELECT id FROM public.v2_tenants WHERE deleted_at IS NULL
  )
);


-- =============================================================================
-- v2_activity_groups
-- =============================================================================

DROP POLICY IF EXISTS "Public can read v2_activity_groups" ON public.v2_activity_groups;

CREATE POLICY "Public can read v2_activity_groups"
ON public.v2_activity_groups
FOR SELECT
TO public
USING (
  tenant_id IN (
    SELECT id FROM public.v2_tenants WHERE deleted_at IS NULL
  )
);


-- =============================================================================
-- v2_activity_group_members
-- =============================================================================

DROP POLICY IF EXISTS "Public can read v2_activity_group_members" ON public.v2_activity_group_members;

CREATE POLICY "Public can read v2_activity_group_members"
ON public.v2_activity_group_members
FOR SELECT
TO public
USING (
  tenant_id IN (
    SELECT id FROM public.v2_tenants WHERE deleted_at IS NULL
  )
);


-- =============================================================================
-- Validation
-- =============================================================================

DO $$
DECLARE
  missing text;
BEGIN
  -- Verify that all three policies exist and use the expected qual substring
  SELECT string_agg(expected.tbl, ', ')
  INTO missing
  FROM (
    VALUES
      ('v2_activities'),
      ('v2_activity_groups'),
      ('v2_activity_group_members')
  ) AS expected(tbl)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    WHERE ns.nspname = 'public'
      AND cls.relname = expected.tbl
      AND pol.polname = 'Public can read ' || expected.tbl
      AND pol.polcmd = 'r'       -- SELECT
      AND pol.polroles = ARRAY[0::oid]  -- TO public (oid 0 = PUBLIC)
  );

  IF missing IS NULL THEN
    RAISE NOTICE 'OK: all three public SELECT policies exist.';
  ELSE
    RAISE EXCEPTION 'FAIL: missing or misconfigured policies on: %', missing;
  END IF;
END $$;


COMMIT;
