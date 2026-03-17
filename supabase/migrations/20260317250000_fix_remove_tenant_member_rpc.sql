-- =============================================================================
-- FIX: remove_tenant_member — authorization + soft-delete
--
-- Problem 1 — authorization mismatch
-- The original function checked owner_user_id = auth.uid() against the tenants
-- table, meaning only the tenant owner could remove members. change_member_role
-- (same privilege level) allows owner OR admin. Inconsistent.
--
-- Problem 2 — hard DELETE instead of soft-delete
-- leave_tenant sets status = 'left'. remove_tenant_member deleted the row
-- entirely, losing audit history and bypassing the unified lookup in
-- invite_tenant_member (which checks for existing rows by user_id/email).
--
-- Fix:
--   1. Replace owner-only check with owner-OR-admin check (same as
--      change_member_role), using the tenant_memberships table directly.
--   2. Replace DELETE with UPDATE status = 'left'.
--   3. Retain existing guards: cannot remove owner, cannot remove non-member.
--   4. Add self-removal guard: caller cannot remove themselves (they must use
--      leave_tenant instead).
--
-- Function signature is unchanged — no existing callers are affected.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_tenant_member(
  p_tenant_id uuid,
  p_user_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role text;
  v_updated_count integer;
BEGIN
  -- Guard: caller cannot remove themselves (use leave_tenant instead)
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself: use leave_tenant instead';
  END IF;

  -- Guard: caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Resolve target member's role
  SELECT role
  INTO v_target_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: cannot remove the tenant owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot remove owner';
  END IF;

  -- Soft-delete: mark as 'left' (consistent with leave_tenant)
  UPDATE public.tenant_memberships
  SET
    status     = 'left',
    updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'member not found';
  END IF;
END;
$$;

REVOKE ALL   ON FUNCTION public.remove_tenant_member(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) TO service_role;
