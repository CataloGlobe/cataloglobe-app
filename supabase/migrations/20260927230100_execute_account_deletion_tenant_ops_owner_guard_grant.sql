-- ACL re-asserted after the replace in 20260927230000 (live staging before the
-- change: EXECUTE for authenticated and service_role, not anon).
REVOKE ALL ON FUNCTION public.execute_account_deletion_tenant_ops(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_account_deletion_tenant_ops(jsonb) TO authenticated, service_role;
