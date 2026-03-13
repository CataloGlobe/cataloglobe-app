BEGIN;

-- =========================================
-- V2: TEAM-AWARE TENANT RESOLUTION
-- =========================================
CREATE OR REPLACE FUNCTION public.get_my_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id
  FROM public.v2_tenants t
  WHERE t.owner_user_id = auth.uid()

  UNION

  SELECT tm.tenant_id
  FROM public.v2_tenant_memberships tm
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
$$;

COMMIT;
