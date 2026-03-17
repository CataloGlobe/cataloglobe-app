-- =============================================================================
-- FIX: user_tenants_view — restrict rows to tenants the caller may access
--
-- The previous definition used a bare LEFT JOIN with no WHERE filter on the
-- join result, so every non-deleted tenant was returned regardless of whether
-- auth.uid() owns it or has an active membership in it.
--
-- A pending (or revoked/expired) invited user had tm.user_id = NULL after the
-- LEFT JOIN because their membership row does not satisfy
-- tm.status = 'active'. With no additional WHERE guard the view still
-- returned those tenants, leaking workspace state to users who have not yet
-- accepted their invite.
--
-- Fix: add an AND clause to the WHERE that requires the calling user to be
-- either the tenant owner or the holder of a matched (active) membership row:
--
--   AND (
--     t.owner_user_id = auth.uid()   -- caller is owner
--     OR tm.user_id IS NOT NULL      -- caller has an active membership (LEFT JOIN matched)
--   )
--
-- The LEFT JOIN itself is unchanged — it is still needed so that the CASE
-- expression can return 'owner' vs tm.role correctly.
-- All selected columns are identical to the previous definition.
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
    ELSE tm.role
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
