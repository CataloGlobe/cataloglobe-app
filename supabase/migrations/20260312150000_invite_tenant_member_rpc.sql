BEGIN;

-- =========================================
-- V2: INVITE TENANT MEMBER RPC
-- =========================================
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
  -- Ensure caller owns the tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.v2_tenants
    WHERE id = p_tenant_id
      AND owner_user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Upsert membership as pending
  INSERT INTO public.v2_tenant_memberships (
    tenant_id,
    user_id,
    role,
    status,
    invited_by
  ) VALUES (
    p_tenant_id,
    p_user_id,
    p_role,
    'pending',
    auth.uid()
  )
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    invited_by = EXCLUDED.invited_by;
END;
$$;

-- Harden permissions
REVOKE ALL ON FUNCTION public.invite_tenant_member(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_tenant_member(uuid, uuid, text) TO service_role;

COMMIT;