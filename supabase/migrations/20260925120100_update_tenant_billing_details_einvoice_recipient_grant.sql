-- ACL riaffermata dopo il replace (live staging: EXECUTE solo authenticated).
REVOKE EXECUTE ON FUNCTION public.update_tenant_billing_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_billing_details(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
