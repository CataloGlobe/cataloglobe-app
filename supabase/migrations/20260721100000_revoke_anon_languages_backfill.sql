-- Fix: enqueue_platform_languages_backfill missing ownership check → cost-DoS anon.
-- Nessun check di autorizzazione nel body: funzione cron/admin, nessun chiamante
-- authenticated legittimo (confermato: nessun supabase.rpc('enqueue_platform_languages_backfill')
-- nel frontend). Chiudere al solo service_role.
--
-- Igiene collaterale: enqueue_tenant_language_backfill ha il check has_permission_any_activity
-- interno (keyed sul tenant, vedi 20260720150001), ma anon ha ancora EXECUTE per via del
-- default grant Supabase (REVOKE FROM PUBLIC non lo copre). authenticated resta (chiamante
-- legittimo: src/services/supabase/tenantLanguages.ts).

REVOKE EXECUTE ON FUNCTION public.enqueue_platform_languages_backfill() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_platform_languages_backfill() TO service_role;

REVOKE EXECUTE ON FUNCTION public.enqueue_tenant_language_backfill(UUID, TEXT) FROM PUBLIC, anon;
