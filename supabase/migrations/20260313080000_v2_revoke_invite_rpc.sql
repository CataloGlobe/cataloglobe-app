BEGIN;

-- =========================================
-- V2: REVOKE INVITE RPC
-- =========================================
--
-- revoke_invite(p_membership_id)
--
-- Revokes a pending invite by setting its status to 'revoked' and clearing
-- the invite token so the link immediately becomes invalid.
--
-- Rules:
--   - Caller must be an active owner or admin of the target tenant.
--   - Only 'pending' invites can be revoked (idempotent for other statuses).
--   - Returns TRUE if a row was updated, FALSE if not found or already
--     in a non-pending state.
-- =========================================

CREATE OR REPLACE FUNCTION public.revoke_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id  uuid;
  v_revoked_id uuid;
BEGIN
  -- Resolve the tenant that owns this membership row
  SELECT tenant_id INTO v_tenant_id
  FROM public.v2_tenant_memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Caller must be an active owner or admin of that tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Revoke: only transitions 'pending' rows; no-op for any other status
  UPDATE public.v2_tenant_memberships
  SET
    status       = 'revoked',
    invite_token = NULL
  WHERE id     = p_membership_id
    AND status = 'pending'
  RETURNING id INTO v_revoked_id;

  RETURN v_revoked_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO service_role;

COMMIT;
