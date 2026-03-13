BEGIN;

-- =========================================
-- V2: HARDEN get_my_tenant_ids() EXECUTE PERMISSIONS
-- =========================================
REVOKE ALL ON FUNCTION public.get_my_tenant_ids() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_tenant_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_tenant_ids() TO service_role;

COMMIT;
