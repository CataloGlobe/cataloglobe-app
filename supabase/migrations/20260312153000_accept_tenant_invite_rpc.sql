BEGIN;

-- =========================================
-- V2: ACCEPT TENANT INVITE RPC
-- =========================================
CREATE OR REPLACE FUNCTION public.accept_tenant_invite(
  p_tenant_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.v2_tenant_memberships
  SET status = 'active'
  WHERE tenant_id = p_tenant_id
    AND user_id = auth.uid()
    AND status = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_tenant_invite(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_tenant_invite(uuid) TO service_role;

COMMIT;
