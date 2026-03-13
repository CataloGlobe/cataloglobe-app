BEGIN;

-- =========================================
-- V2: TENANT MEMBERSHIPS - PENDING INVITES INDEX
-- =========================================
CREATE INDEX IF NOT EXISTS v2_tenant_memberships_pending_idx
  ON public.v2_tenant_memberships (tenant_id)
  WHERE status = 'pending';

COMMIT;
