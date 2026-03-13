BEGIN;

-- =========================================
-- V2: TENANT MEMBERSHIPS - INDEX FOR TEAM LOOKUP
-- =========================================
CREATE INDEX IF NOT EXISTS v2_tenant_memberships_user_status_tenant_id_idx
  ON public.v2_tenant_memberships (user_id, status, tenant_id);

COMMIT;
