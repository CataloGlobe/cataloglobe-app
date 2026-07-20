-- REVOKE/GRANT per list_active_public_slugs() — file separato dal CREATE
-- FUNCTION (20260719120000) per evitare SQLSTATE 42601 su db push.
--
-- SECURITY DEFINER non destinata a anon/authenticated: Supabase pre-configura
-- grant default a anon, authenticated, service_role → REVOKE FROM PUBLIC non
-- basta. REVOKE espliciti + GRANT solo a service_role (chiamata dal cron
-- server-side con service key).

revoke execute on function public.list_active_public_slugs() from public;
revoke execute on function public.list_active_public_slugs() from anon;
revoke execute on function public.list_active_public_slugs() from authenticated;
grant execute on function public.list_active_public_slugs() to service_role;
