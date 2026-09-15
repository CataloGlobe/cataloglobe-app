-- =============================================================================
-- ACL _close_order_group_unchecked: nessun ruolo applicativo (5/14)
-- =============================================================================
-- La chiamano `close_table_with_resolution`, `close_seating` e
-- `close_stale_seatings`, tutte SECURITY DEFINER dello stesso owner.
--
-- Verifica post-deploy (attesi: tutti false):
--   SELECT r, has_function_privilege(r, 'public._close_order_group_unchecked(uuid,text)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public._close_order_group_unchecked(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
