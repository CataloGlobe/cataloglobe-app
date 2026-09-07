-- =============================================================================
-- Grant per assign_sunmi_shop_id — file separato dal CREATE FUNCTION per la
-- regola 42601 di `supabase db push` (docs/patterns/storage-sql.md).
--
-- SECURITY DEFINER non destinata a anon/authenticated: Supabase pre-configura
-- EXECUTE a anon, authenticated, service_role → REVOKE esplicito da tutti e
-- GRANT solo a service_role.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.assign_sunmi_shop_id(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_sunmi_shop_id(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.assign_sunmi_shop_id(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.assign_sunmi_shop_id(uuid) TO service_role;
