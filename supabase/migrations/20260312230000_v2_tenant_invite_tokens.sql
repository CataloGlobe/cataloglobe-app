BEGIN;

-- =========================================
-- V2: TENANT INVITE TOKENS
-- =========================================
--
-- Adds a token-based invite acceptance flow:
--   1. invite_token column on v2_tenant_memberships
--   2. Update invite_tenant_member() to generate a token on invite
--   3. get_invite_info_by_token(uuid) — read invite details
--   4. accept_invite_by_token(uuid)   — accept and activate membership
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Add invite_token column
-- -----------------------------------------------------------------------
ALTER TABLE public.v2_tenant_memberships
  ADD COLUMN IF NOT EXISTS invite_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS v2_tenant_memberships_invite_token_idx
  ON public.v2_tenant_memberships (invite_token)
  WHERE invite_token IS NOT NULL;


-- -----------------------------------------------------------------------
-- 2. Update invite_tenant_member() to generate a token on every invite
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.invite_tenant_member(
  p_tenant_id uuid,
  p_user_id uuid,
  p_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.v2_tenants
    WHERE id = p_tenant_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  INSERT INTO public.v2_tenant_memberships (
    tenant_id, user_id, role, status, invited_by, invite_token
  ) VALUES (
    p_tenant_id, p_user_id, p_role, 'pending', auth.uid(), gen_random_uuid()
  )
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET
    role         = EXCLUDED.role,
    status       = 'pending',
    invited_by   = EXCLUDED.invited_by,
    invite_token = gen_random_uuid();
END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO service_role;


-- -----------------------------------------------------------------------
-- 3. get_invite_info_by_token — returns tenant name and role for display
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_invite_info_by_token(p_token uuid)
RETURNS TABLE (
  tenant_id   uuid,
  tenant_name text,
  role        text,
  status      text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT t.id, t.name, tm.role, tm.status
    FROM public.v2_tenant_memberships tm
    JOIN public.v2_tenants t ON t.id = tm.tenant_id
    WHERE tm.invite_token = p_token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invite_info_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invite_info_by_token(uuid) TO service_role;


-- -----------------------------------------------------------------------
-- 4. accept_invite_by_token — activates the membership for auth.uid()
--    Verifies user_id matches to prevent token hijacking.
--    Consumes the token (sets to NULL) after use.
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_invite_by_token(p_token uuid)
RETURNS uuid   -- returns tenant_id for post-accept redirect
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  UPDATE public.v2_tenant_memberships
  SET
    status       = 'active',
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
    AND user_id      = auth.uid()
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
