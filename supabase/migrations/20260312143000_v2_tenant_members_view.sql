BEGIN;

-- =========================================
-- V2: TENANT MEMBERS VIEW
-- =========================================
CREATE OR REPLACE VIEW public.v2_tenant_members_view AS
SELECT
  tm.tenant_id,
  tm.user_id,
  u.email,
  tm.role,
  tm.status,
  tm.invited_by,
  tm.created_at
FROM public.v2_tenant_memberships tm
LEFT JOIN auth.users u
  ON u.id = tm.user_id;

COMMIT;
