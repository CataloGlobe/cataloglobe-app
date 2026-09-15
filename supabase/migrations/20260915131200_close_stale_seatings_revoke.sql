-- =============================================================================
-- ACL close_stale_seatings(): nessun ruolo applicativo, nessun GRANT (13/14)
-- =============================================================================
-- Ricreata con la nuova firma di ritorno: i grant di default vanno azzerati
-- di nuovo. Come 20260914160400. La lancia solo il cron come `postgres`.
--
-- Verifica post-deploy (attesi: tutti false):
--   SELECT r, has_function_privilege(r, 'public.close_stale_seatings()', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public.close_stale_seatings()
FROM PUBLIC, anon, authenticated, service_role;
