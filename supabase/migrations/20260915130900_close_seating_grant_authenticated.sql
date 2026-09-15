-- =============================================================================
-- ACL close_seating(uuid, text, text) (10/14): GRANT a authenticated
-- =============================================================================
-- Unico chiamante: la dashboard. Come 20260911130700.
--
-- Verifica post-deploy (attesi: authenticated=true, anon=false, service_role=false):
--   SELECT r, has_function_privilege(r, 'public.close_seating(uuid,text,text)', 'EXECUTE')
--   FROM unnest(ARRAY['anon','authenticated','service_role']) r;

GRANT EXECUTE ON FUNCTION public.close_seating(uuid, text, text) TO authenticated;
