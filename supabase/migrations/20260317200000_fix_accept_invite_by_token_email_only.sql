-- =============================================================================
-- FIX: accept_invite_by_token — broken for email-only invites
--
-- Regression introduced in 20260317120000_rename_v2_tables.sql (section 7-G).
-- That migration reverted to an older snapshot that added:
--
--     AND user_id = auth.uid()
--
-- to the WHERE clause. For email-only invites the membership row has
-- user_id = NULL, so NULL = auth.uid() evaluates to NULL (never TRUE),
-- the UPDATE matches zero rows, and the function raises
-- 'invalid or already used invite token' — leaving the membership permanently
-- stuck in 'pending' and the user locked out of the tenant.
--
-- Restored from 20260313130000_v2_accept_invite_atomic.sql, updated for the
-- renamed table (tenant_memberships instead of v2_tenant_memberships):
--
--   WHERE clause: matches by token + status + expiry only (no user_id filter)
--   SET clause:   explicitly assigns user_id = auth.uid(), clears invited_email
--                 and invite_token, records invite_accepted_at
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Single atomic UPDATE: validates status and expiry, accepts in one step.
  -- No user_id filter in WHERE — required for email-only invites where the
  -- row was created with user_id = NULL.
  -- user_id is set here so get_my_tenant_ids() and all RLS policies that
  -- depend on tm.user_id = auth.uid() work immediately after acceptance.
  UPDATE public.tenant_memberships
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

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$$;

REVOKE ALL   ON FUNCTION public.accept_invite_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite_by_token(uuid) TO service_role;
