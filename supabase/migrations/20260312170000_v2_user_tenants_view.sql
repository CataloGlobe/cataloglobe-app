BEGIN;

-- =========================================
-- V2: USER TENANTS VIEW
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
  AND tm.status = 'active';

COMMIT;