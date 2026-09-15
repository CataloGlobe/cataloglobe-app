-- =============================================================================
-- ACL _open_seating_for_table_unchecked: nessun ruolo applicativo (2/14)
-- =============================================================================
-- La chiama solo `submit_order_atomic` (SECURITY DEFINER, owner postgres).
-- Come 20260914160100.
--
-- Verifica post-deploy (attesi: tutti false):
--   SELECT r, has_function_privilege(r, 'public._open_seating_for_table_unchecked(uuid,uuid,uuid)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public._open_seating_for_table_unchecked(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
