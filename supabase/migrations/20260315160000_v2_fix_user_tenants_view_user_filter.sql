BEGIN;

-- =============================================================================
-- Fix: restore user-scoped filter on v2_user_tenants_view
-- =============================================================================
--
-- Bug introduced in 20260314170000_v2_soft_delete_tenant.sql (Step 3):
--   When adding the deleted_at IS NULL filter, the CREATE OR REPLACE dropped
--   the user-scoping WHERE clause that 20260312210000 had established:
--
--     WHERE t.id IN (SELECT public.get_my_tenant_ids())
--
--   The resulting view returns ALL non-deleted tenants on the platform,
--   regardless of who the calling user is. Any authenticated user querying
--   v2_user_tenants_view from the frontend (WorkspacePage, TenantProvider)
--   receives the full tenant list of all other users.
--
-- Why RLS does not protect the view:
--   PostgreSQL views execute as their owner (typically 'postgres' in Supabase),
--   which is a superuser that bypasses RLS. The RLS policies on v2_tenants
--   are never evaluated when the view reads that table. The filter must be
--   explicit in the view definition itself.
--
-- Fix:
--   Restore the WHERE clause from 20260312210000, combined with the
--   deleted_at IS NULL filter from 20260314170000.
--
--   get_my_tenant_ids() is SECURITY DEFINER — it bypasses RLS internally and
--   returns only the tenant IDs accessible to auth.uid() (owner branch +
--   active membership branch), already filtering deleted_at IS NULL after
--   migration 20260315120000. The explicit deleted_at IS NULL guard here is
--   retained as a defence-in-depth safeguard independent of the function.
-- =============================================================================

CREATE OR REPLACE VIEW public.v2_user_tenants_view AS
SELECT
  t.id,
  t.name,
  t.vertical_type,
  t.created_at,
  t.owner_user_id,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    ELSE tm.role
  END AS user_role
FROM public.v2_tenants t
LEFT JOIN public.v2_tenant_memberships tm
  ON tm.tenant_id = t.id
  AND tm.user_id = auth.uid()
  AND tm.status = 'active'
WHERE
  t.deleted_at IS NULL
  AND t.id IN (SELECT public.get_my_tenant_ids());


-- =============================================================================
-- Validation
-- =============================================================================
-- Verify the view definition contains both filter predicates.
-- pg_get_viewdef() returns the reconstructed SQL from the parse tree.

DO $$
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('public.v2_user_tenants_view'::regclass, true)
  INTO view_def;

  IF view_def IS NULL THEN
    RAISE EXCEPTION 'FAIL: v2_user_tenants_view not found.';
  END IF;

  IF view_def NOT ILIKE '%get_my_tenant_ids%' THEN
    RAISE EXCEPTION 'FAIL: v2_user_tenants_view is missing the get_my_tenant_ids() filter.';
  END IF;

  IF view_def NOT ILIKE '%deleted_at IS NULL%' THEN
    RAISE EXCEPTION 'FAIL: v2_user_tenants_view is missing the deleted_at IS NULL filter.';
  END IF;

  RAISE NOTICE 'OK: v2_user_tenants_view contains both user-scoping and deleted_at filters.';
END $$;


COMMIT;
