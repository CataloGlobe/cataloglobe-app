-- =============================================================================
-- RUBRICA CLIENTI — revoca EXECUTE su reservations_link_guest()
-- =============================================================================
-- Funzione SECURITY DEFINER non destinata a essere chiamata da nessuno: e'
-- solo il corpo di un trigger. L'esecuzione del trigger NON passa dal
-- privilegio EXECUTE del chiamante, quindi revocarlo a tutti non lo rompe.
--
-- `REVOKE FROM PUBLIC` da solo non basta: Supabase pre-configura i grant di
-- default a anon, authenticated e service_role. Vanno revocati esplicitamente
-- (stesso pattern di 20260901100002_reservation_helpers_revoke.sql).
--
-- File separato: REVOKE nello stesso file della CREATE FUNCTION fa fallire
-- `supabase db push` con 42601.
--
-- Verifica post-deploy:
--   SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'reservations_link_guest';
--   -- deve tornare false
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.reservations_link_guest() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reservations_link_guest() FROM anon;
REVOKE EXECUTE ON FUNCTION public.reservations_link_guest() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reservations_link_guest() FROM service_role;
