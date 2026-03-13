BEGIN;

-- =========================================
-- V2: EMAIL-ONLY INVITATIONS
-- =========================================
--
-- Allows inviting users who do not yet have a CataloGlobe account.
--
-- Changes:
--   1. Add invited_email column to v2_tenant_memberships
--   2. CHECK: user_id IS NOT NULL OR invited_email IS NOT NULL
--   3. Unique index: one pending email invite per (tenant, email)
--   4. Replace invite_tenant_member(uuid, uuid, text)
--        with invite_tenant_member(uuid, text, text):
--        - resolves email → user_id internally
--        - stores invited_email when user doesn't exist yet
--        - returns invite_token (uuid) for immediate use by caller
--   5. Update accept_invite_by_token to clear invited_email on accept
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Add invited_email column
-- -----------------------------------------------------------------------
ALTER TABLE public.v2_tenant_memberships
  ADD COLUMN IF NOT EXISTS invited_email text;


-- -----------------------------------------------------------------------
-- 2. CHECK constraint: every row must have a user or an email
-- -----------------------------------------------------------------------
ALTER TABLE public.v2_tenant_memberships
  DROP CONSTRAINT IF EXISTS v2_tenant_memberships_has_user_or_email;

ALTER TABLE public.v2_tenant_memberships
  ADD CONSTRAINT v2_tenant_memberships_has_user_or_email
  CHECK (user_id IS NOT NULL OR invited_email IS NOT NULL);


-- -----------------------------------------------------------------------
-- 3. Unique index: one pending email invite per (tenant, email)
-- -----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS v2_tenant_memberships_unique_pending_email
  ON public.v2_tenant_memberships (tenant_id, lower(invited_email))
  WHERE status = 'pending' AND invited_email IS NOT NULL;


-- -----------------------------------------------------------------------
-- 4. Replace invite_tenant_member
--
--    Old signature: (p_tenant_id uuid, p_user_id uuid, p_role text) RETURNS void
--    New signature: (p_tenant_id uuid, p_email text,   p_role text) RETURNS uuid
--
--    Logic:
--      A. If email resolves to an existing auth.users row → use user_id
--         - RAISE if already active member
--         - RAISE if pending invite exists (by user_id OR by email)
--      B. Else → store invited_email, leave user_id NULL
--         - RAISE if a pending email invite already exists
-- -----------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.invite_tenant_member(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_email     text,
  p_role      text
)
RETURNS uuid   -- invite_token, for immediate use by the caller
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid;
  v_status   text;
  v_token    uuid;
BEGIN
  -- Caller must own the tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.v2_tenants
    WHERE id = p_tenant_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Try to resolve email → user_id
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    -- Path A: user already has an account
    SELECT status INTO v_status
    FROM public.v2_tenant_memberships
    WHERE tenant_id = p_tenant_id
      AND user_id   = v_user_id;

    IF v_status = 'active' THEN
      RAISE EXCEPTION 'user already member';
    END IF;

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

    -- Also catch a pre-existing email-only invite for this address
    SELECT status INTO v_status
    FROM public.v2_tenant_memberships
    WHERE tenant_id     = p_tenant_id
      AND lower(invited_email) = lower(p_email);

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;

  ELSE
    -- Path B: user does not have an account yet
    SELECT status INTO v_status
    FROM public.v2_tenant_memberships
    WHERE tenant_id          = p_tenant_id
      AND lower(invited_email) = lower(p_email);

    IF v_status = 'pending' THEN
      RAISE EXCEPTION 'invite already pending';
    END IF;
  END IF;

  v_token := gen_random_uuid();

  INSERT INTO public.v2_tenant_memberships (
    tenant_id, user_id, invited_email, role, status, invited_by, invite_token
  ) VALUES (
    p_tenant_id,
    v_user_id,
    CASE WHEN v_user_id IS NULL THEN lower(p_email) ELSE NULL END,
    p_role,
    'pending',
    auth.uid(),
    v_token
  );

  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) TO service_role;


-- -----------------------------------------------------------------------
-- 5. Update accept_invite_by_token — clear invited_email on accept
-- -----------------------------------------------------------------------
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
    user_id       = auth.uid(),
    status        = 'active',
    invited_email = NULL,
    invite_token  = NULL
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
