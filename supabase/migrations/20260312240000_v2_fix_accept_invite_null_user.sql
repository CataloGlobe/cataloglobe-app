BEGIN;

-- =========================================
-- V2: FIX accept_invite_by_token
-- =========================================
--
-- Previous version had AND user_id = auth.uid() in the WHERE clause.
-- Pending invites have user_id = NULL (set at accept time), so that
-- condition always failed and no row was ever updated.
--
-- Fix: remove user_id from WHERE; set it in the UPDATE instead.
-- The token itself is the security credential — only the holder of
-- the UUID token can accept.
-- =========================================

CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  UPDATE public.v2_tenant_memberships
  SET
    user_id      = auth.uid(),
    status       = 'active',
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
  RETURNING tenant_id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO service_role;

COMMIT;
