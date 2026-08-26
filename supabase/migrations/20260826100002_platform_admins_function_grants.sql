-- ============================================================================
-- ACL di public.is_platform_admin()
-- ============================================================================
--
-- File separato dalla CREATE FUNCTION (20260826100001): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- REVOKE FROM PUBLIC non basta: Supabase pre-configura grant di default a
-- `anon, authenticated, service_role`, quindi `anon` va revocato esplicitamente.
--
-- ACL attesa a fine migration, identica a quella di get_my_tenant_ids():
--   postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- (nessuna entry per `anon`, nessun grant a PUBLIC)
-- ============================================================================

REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM anon;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO service_role;
