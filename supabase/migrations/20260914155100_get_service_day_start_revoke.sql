-- =============================================================================
-- ACL get_service_day_start: nessun ruolo applicativo, nessun GRANT
-- =============================================================================
-- La chiama solo `close_stale_seatings` (SECURITY DEFINER, owner postgres).
-- Il client calcola lo stesso confine per conto suo (`serviceDay.ts`): non ha
-- bisogno della RPC, e non esporla evita che qualcuno la scambi per l'unica
-- fonte del confine quando in realtà sono due, sincronizzate.
--
-- Verifica post-deploy (attesi: tutti false):
--
--   SELECT r, has_function_privilege(r, 'public.get_service_day_start()', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public.get_service_day_start()
FROM PUBLIC, anon, authenticated, service_role;
