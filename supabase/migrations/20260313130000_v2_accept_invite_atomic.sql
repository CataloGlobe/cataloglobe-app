BEGIN;

-- =========================================
-- V2: ATOMIC accept_invite_by_token
-- =========================================
--
-- Previous implementation used a two-step pattern:
--   1. SELECT to validate (status, expiry)
--   2. UPDATE to accept
--
-- This created a TOCTOU (time-of-check/time-of-use) window: two concurrent
-- requests could both pass the SELECT and then race to UPDATE, with the
-- second UPDATE silently succeeding on zero rows.
--
-- New implementation collapses both steps into a single conditional UPDATE:
--
--   UPDATE … WHERE invite_token = p_token
--                AND status = 'pending'
--                AND invite_expires_at > now()
--   RETURNING tenant_id;
--
-- PostgreSQL evaluates the WHERE clause and the SET atomically inside the
-- row-level lock, so no two transactions can accept the same invite.
-- If RETURNING produces no row the invite is invalid, already used, or
-- expired — a single error covers all three cases.
--
-- Trade-off: the previous function could raise a distinct 'invite expired'
-- message. The atomic UPDATE cannot distinguish expiry from "already used"
-- without a follow-up read. The unified error 'invalid or already used
-- invite token' is raised instead. Update any client-side expiry detection
-- (e.g. InvitePage.tsx error.message check) accordingly.
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
  -- Single atomic UPDATE: validates status, expiry, and accepts in one step.
  -- The WHERE clause is evaluated under a row lock, preventing concurrent
  -- accepts from both succeeding.
  UPDATE public.v2_tenant_memberships
  SET
    status             = 'active',
    user_id            = auth.uid(),
    invited_email      = NULL,
    invite_token       = NULL,
    invite_accepted_at = now()
  WHERE invite_token       = p_token
    AND status             = 'pending'
    AND invite_expires_at  > now()
  RETURNING tenant_id INTO v_tenant_id;

  -- No row updated → invite is invalid, already used, or expired
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
