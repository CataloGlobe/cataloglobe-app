-- =============================================================================
-- RETENTION PRENOTAZIONI — permessi sui selettori
-- =============================================================================
-- File separato dal CREATE FUNCTION: insieme fanno fallire `supabase db push`
-- con 42601 (vedi docs/patterns/storage-sql.md).
--
-- Sono SECURITY DEFINER e leggono la rubrica di TUTTI i tenant, quindi non
-- devono essere raggiungibili da anon/authenticated. REVOKE FROM PUBLIC non
-- basta: Supabase pre-configura i grant di default a anon, authenticated e
-- service_role, quindi i REVOKE vanno espliciti per ciascun ruolo.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.list_expired_reservation_guests(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_expired_reservation_guests(date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_expired_reservation_guests(date, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.list_expired_reservation_guests(date, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.list_expired_orphan_reservations(date, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_expired_orphan_reservations(date, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_expired_orphan_reservations(date, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.list_expired_orphan_reservations(date, integer) TO service_role;

-- Verifica post-deploy attesa: has_function_privilege = false per anon e
-- authenticated, true per service_role.
--
--   SELECT p.proname,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') AS svc
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('list_expired_reservation_guests',
--                       'list_expired_orphan_reservations');
