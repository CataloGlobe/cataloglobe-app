-- =============================================================================
-- FIX: user_tenants_view — correct user_role resolution
--
-- Problem: the CASE expression returned 'owner' or tm.role (which could be
-- NULL if the LEFT JOIN produced no match). A NULL role would cause the
-- frontend to misinterpret the access level. The explicit fallback to NULL
-- makes it clear the calling user has no recognized role for that row,
-- though the WHERE guard should prevent such rows from appearing in practice.
--
-- Changes:
--   1. CASE adds explicit WHEN tm.role IS NOT NULL branch before the ELSE NULL
--      fallback, making role resolution unambiguous.
--   2. JOIN condition is written explicitly (unchanged from 20260317220000).
--   3. WHERE retains the access guard: owner OR matched active membership.
--
-- Column names and overall structure are identical to 20260317220000.
-- =============================================================================

CREATE OR REPLACE VIEW public.user_tenants_view AS
SELECT
  t.id,
  t.name,
  t.vertical_type,
  t.created_at,
  t.owner_user_id,
  CASE
    WHEN t.owner_user_id = auth.uid() THEN 'owner'
    WHEN tm.role IS NOT NULL           THEN tm.role
    ELSE NULL
  END AS user_role
FROM public.tenants t
LEFT JOIN public.tenant_memberships tm
  ON  tm.tenant_id = t.id
  AND tm.user_id   = auth.uid()
  AND tm.status    = 'active'
WHERE t.deleted_at IS NULL
  AND (
    t.owner_user_id = auth.uid()
    OR tm.user_id IS NOT NULL
  );
