BEGIN;

-- =========================================
-- V2: INVITE GUARD — INDEX + RPC HARDENING
-- =========================================


-- -----------------------------------------------------------------------
-- 1. Partial unique index: one pending invite per (tenant, user)
--
-- The table already has a full unique index on (tenant_id, user_id),
-- so only one row per pair can ever exist. This partial index makes the
-- constraint intent explicit and enables efficient lookups on pending rows.
-- -----------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS v2_tenant_memberships_unique_pending
  ON public.v2_tenant_memberships (tenant_id, user_id)
  WHERE status = 'pending';


-- -----------------------------------------------------------------------
-- 2. Update invite_tenant_member — explicit guards, no silent upsert
--
-- Previous version used ON CONFLICT DO UPDATE, which silently re-invited
-- users regardless of their current status.
--
-- New version:
--   - Raises 'user already member'   if status = 'active'
--   - Raises 'invite already pending' if status = 'pending'
--   - Inserts normally otherwise
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
DECLARE
  v_status text;
BEGIN
  -- Caller must own the tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.v2_tenants
    WHERE id = p_tenant_id AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Check for an existing membership row
  SELECT status INTO v_status
  FROM public.v2_tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'user already member';
  END IF;

  IF v_status = 'pending' THEN
    RAISE EXCEPTION 'invite already pending';
  END IF;

  -- No existing row — create the invite
  INSERT INTO public.v2_tenant_memberships (
    tenant_id, user_id, role, status, invited_by, invite_token
  ) VALUES (
    p_tenant_id, p_user_id, p_role, 'pending', auth.uid(), gen_random_uuid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO service_role;

COMMIT;
