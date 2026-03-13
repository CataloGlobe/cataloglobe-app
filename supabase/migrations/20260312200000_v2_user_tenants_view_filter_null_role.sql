BEGIN;

-- =========================================
-- V2: FIX v2_user_tenants_view — FILTER NULL ROLE
-- =========================================
--
-- Previous definition used LEFT JOIN with no WHERE clause.
-- If the user is neither owner nor active member, tm.* is NULL
-- and user_role resolves to NULL. Those rows must not appear.
--
-- Fix: add WHERE clause that keeps only rows where the user is
-- owner OR the LEFT JOIN matched an active membership row.
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
  t.owner_user_id = auth.uid()
  OR tm.tenant_id IS NOT NULL;

COMMIT;
