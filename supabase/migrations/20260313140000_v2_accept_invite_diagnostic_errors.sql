BEGIN;

-- =========================================
-- V2: RESTORE DIAGNOSTIC ERRORS IN accept_invite_by_token
-- =========================================
--
-- The atomic UPDATE (migration 20260313130000) collapsed all failure cases
-- into a single generic error. This migration restores specific error messages
-- by adding a read-only diagnostic SELECT that runs only when the UPDATE
-- produces no row.
--
-- The diagnostic SELECT is safe: it cannot change state, and running it after
-- the UPDATE has already committed (or rolled back) its lock introduces no new
-- race window — any row it finds is the definitive post-UPDATE state.
--
-- Failure mapping:
--   Row found, invite_expires_at < now()  → 'invite expired'
--   Row found, status = 'active'          → 'invite already accepted'
--   Row found, status = 'revoked'         → 'invite revoked'
--   No row found                          → 'invalid invite token'
--
-- The UPDATE itself is unchanged and remains the only state-changing operation.
-- =========================================

CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id    uuid;
  v_status       text;
  v_expires_at   timestamptz;
BEGIN
  -- Atomic UPDATE: validates status and expiry in a single locked operation.
  -- No two concurrent transactions can both succeed for the same token.
  UPDATE public.v2_tenant_memberships
  SET
    status             = 'active',
    user_id            = auth.uid(),
    invited_email      = NULL,
    invite_token       = NULL,
    invite_accepted_at = now()
  WHERE invite_token      = p_token
    AND status            = 'pending'
    AND invite_expires_at > now()
  RETURNING tenant_id INTO v_tenant_id;

  -- Fast path: UPDATE succeeded.
  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- Slow path: UPDATE matched no row. Run a read-only diagnostic to surface
  -- the specific reason. This SELECT does not change state and introduces no
  -- race window — the UPDATE has already resolved any contention above.
  SELECT tm.status, tm.invite_expires_at
  INTO v_status, v_expires_at
  FROM public.v2_tenant_memberships tm
  WHERE tm.invite_token = p_token;

  IF NOT FOUND THEN
    -- Token does not exist (never issued, already cleared after accept/revoke)
    RAISE EXCEPTION 'invalid invite token';
  END IF;

  IF v_expires_at IS NOT NULL AND v_expires_at < now() THEN
    RAISE EXCEPTION 'invite expired';
  END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'invite already accepted';
  END IF;

  IF v_status = 'revoked' THEN
    RAISE EXCEPTION 'invite revoked';
  END IF;

  -- Catch-all for any unexpected status value
  RAISE EXCEPTION 'invalid or already used invite token';
END;
$$;

REVOKE ALL ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO service_role;

COMMIT;
