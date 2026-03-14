BEGIN;

-- =========================================
-- V2: INTRODUCE 'declined' STATUS + delete_invite RPC
-- =========================================
--
-- Changes:
--
-- 1. decline_invite_by_token — sets status = 'declined' instead of 'revoked'.
--    Semantics: 'revoked' = cancelled by inviter; 'declined' = rejected by recipient.
--
-- 2. delete_invite(p_membership_id) — permanently removes a non-active invite
--    row whose lifecycle has ended (declined / revoked / expired).
--    Only owners and admins of the tenant can call this.
--
-- No table structure changes are required: the status column is text,
-- so 'declined' is a valid value without a schema alteration.
-- All existing functions (invite_tenant_member, accept_invite_by_token,
-- resend_invite, revoke_invite, expire_old_invites) are unchanged.
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Update decline_invite_by_token
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.decline_invite_by_token(p_token uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_declined_id uuid;
BEGIN
  UPDATE public.v2_tenant_memberships
  SET
    status       = 'declined',   -- was 'revoked'; semantically distinct
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
  RETURNING id INTO v_declined_id;

  RETURN v_declined_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.decline_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.decline_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_invite_by_token(uuid) TO service_role;


-- -----------------------------------------------------------------------
-- 2. delete_invite
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_invite(p_membership_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_deleted_id uuid;
BEGIN
  -- Resolve the tenant that owns this membership
  SELECT tenant_id INTO v_tenant_id
  FROM public.v2_tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired');

  IF NOT FOUND THEN
    -- Row does not exist or is in an undeletable status (active / pending)
    RETURN false;
  END IF;

  -- Caller must be an active owner or admin of the tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.v2_tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired')
  RETURNING id INTO v_deleted_id;

  RETURN v_deleted_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_invite(uuid) TO service_role;

COMMIT;
