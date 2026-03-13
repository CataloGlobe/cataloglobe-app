BEGIN;

-- =========================================
-- V2: FIX v2_user_tenants_view — EXPLICIT ROLE FILTER
-- =========================================
--
-- Problem: LEFT JOIN on v2_tenant_memberships may return NULL when
-- the user has no matching active membership, causing user_role to
-- resolve incorrectly.
--
-- Fix:
--   1. Filter rows using get_my_tenant_ids() (SECURITY DEFINER) —
--      guarantees only tenants where the user is owner or active
--      member are returned, regardless of RLS on v2_tenant_memberships.
--   2. CASE remains unchanged: 'owner' when user owns the tenant,
--      tm.role otherwise. The WHERE ensures the ELSE branch is only
--      reached for rows where a valid membership exists.
-- =========================================

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
  t.id IN (SELECT public.get_my_tenant_ids());

COMMIT;
