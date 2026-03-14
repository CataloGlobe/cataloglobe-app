BEGIN;

-- =========================================
-- V2: CHANGE MEMBER ROLE RPC
-- =========================================
--
-- change_member_role(p_tenant_id, p_user_id, p_role)
--
-- Allows an active owner or admin to change the role of another active member.
--
-- Rules:
--   - Caller must be an active owner or admin of the tenant.
--   - p_role must be 'admin' or 'member' (promoting to 'owner' is a separate
--     ownership-transfer operation and is not allowed here).
--   - The target member's current role must not be 'owner' (owner role is
--     protected from change via this function).
--   - Only active memberships can have their role changed.
--
-- Returns TRUE if the role was updated, FALSE if no matching active non-owner
-- membership was found.
-- =========================================

CREATE OR REPLACE FUNCTION public.change_member_role(
  p_tenant_id uuid,
  p_user_id   uuid,
  p_role      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  -- Validate target role
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: must be admin or member';
  END IF;

  -- Caller must be an active owner or admin
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Update target: only active non-owner memberships
  UPDATE public.v2_tenant_memberships
  SET role = p_role
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active'
    AND role      != 'owner'
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.change_member_role(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) TO service_role;

COMMIT;
