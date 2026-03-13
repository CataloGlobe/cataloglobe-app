BEGIN;

-- =========================================
-- V2: INVITE TENANT MEMBER — REFACTOR
-- =========================================
--
-- Replaces invite_tenant_member(uuid, text, text) RETURNS uuid
-- introduced in 20260313000000.
--
-- Changes:
--   1. Authorization: caller must be an active owner or admin in
--      v2_tenant_memberships (previously: owner_user_id on v2_tenants).
--      This aligns with the membership model and allows admins to invite.
--
--   2. Return type: RETURNS TABLE(membership_id, email, role, invite_token, status)
--      (previously: RETURNS uuid — invite_token only).
--
--   3. Email normalization: lower(trim(p_email)) applied once at entry.
--
--   4. Fix v2_tenant_members_view: show invited_email as fallback when
--      user_id is NULL.
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Replace invite_tenant_member
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.invite_tenant_member(uuid, text, text);

CREATE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
)
RETURNS TABLE (
  membership_id uuid,
  email         text,
  role          text,
  invite_token  uuid,
  status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid;
  v_status    text;
  v_token     uuid;
  v_member_id uuid;
BEGIN
  -- Caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Normalize email once at entry
  p_email := lower(trim(p_email));

  -- Try to resolve email → user_id from auth.users
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN

    -- Path A: invitee already has an account
    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = v_user_id;

    IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member'; END IF;
    IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;

    -- Guard against stale email-only invite
    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

  ELSE

    -- Path B: invitee has no account yet
    SELECT tm.status INTO v_status
    FROM public.v2_tenant_memberships tm
    WHERE tm.tenant_id            = p_tenant_id
      AND lower(tm.invited_email) = p_email;

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

  END IF;

  v_token := gen_random_uuid();

  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    invited_email,
    role,
    status,
    invited_by,
    invite_token
  ) VALUES (
    p_tenant_id,
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
    p_role,
    'pending',
    auth.uid(),
    v_token
  )
  RETURNING id INTO v_member_id;

  RETURN QUERY SELECT
    v_member_id,
    p_email,
    p_role,
    v_token,
    'pending'::text;

END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;


-- -----------------------------------------------------------------------
-- 2. Fix v2_tenant_members_view
-- -----------------------------------------------------------------------

DROP VIEW IF EXISTS public.v2_tenant_members_view;

CREATE VIEW public.v2_tenant_members_view AS
SELECT
  tm.tenant_id,
  tm.user_id,
  COALESCE(u.email::text, tm.invited_email::text) AS email,
  tm.role,
  tm.status,
  tm.invited_by,
  tm.created_at
FROM public.v2_tenant_memberships tm
LEFT JOIN auth.users u ON u.id = tm.user_id;

COMMIT;