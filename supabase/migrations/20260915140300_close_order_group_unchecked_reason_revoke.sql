-- =============================================================================
-- ACL _close_order_group_unchecked(uuid, text, text): nessun ruolo (3/6)
-- =============================================================================
-- Nuova firma → grant di default da azzerare, come 20260915130400.
--
-- Verifica post-deploy (attesi: tutti false):
--   SELECT r, has_function_privilege(r, 'public._close_order_group_unchecked(uuid,text,text)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

REVOKE ALL ON FUNCTION public._close_order_group_unchecked(uuid, text, text)
FROM PUBLIC, anon, authenticated, service_role;
