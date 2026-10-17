-- Editor stili (PR 6 di 6), seconda parte di 20261017200000: separata perché db push
-- non accetta CREATE FUNCTION e REVOKE nello stesso file (42601, docs/patterns/storage-sql.md).
-- Come 20260429150000 e 20260429160000: la funzione la chiama solo il trigger.
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM anon, authenticated;
