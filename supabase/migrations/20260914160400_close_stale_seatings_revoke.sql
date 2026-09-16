-- =============================================================================
-- ACL close_stale_seatings: nessun ruolo applicativo, nessun GRANT
-- =============================================================================
-- La esegue solo il cron, come `postgres` (owner ⇒ bypassa l'ACL). Dalla
-- dashboard, dalle Edge function e dalla pagina pubblica non è raggiungibile.
-- Come 20260914160100.
--
-- Verifica post-deploy (attesi: tutti false):
--
--   SELECT r, has_function_privilege(r, 'public.close_stale_seatings()', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public.close_stale_seatings()
FROM PUBLIC, anon, authenticated, service_role;
