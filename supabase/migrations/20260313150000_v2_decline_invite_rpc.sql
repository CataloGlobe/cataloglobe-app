BEGIN;

-- =========================================
-- V2: DECLINE INVITE BY TOKEN RPC
-- =========================================
--
-- decline_invite_by_token(p_token)
--
-- Called by an authenticated user who received an invite and chooses to
-- decline it. Sets status = 'revoked' and clears the token so the link
-- becomes immediately invalid.
--
-- No ownership check is performed: possessing the token is sufficient
-- authorization (the token was emailed exclusively to the invitee).
--
-- Returns TRUE if the invite was declined, FALSE if the token was not found
-- or was already in a non-pending state.
-- =========================================

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
    status       = 'revoked',
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

COMMIT;
