-- =============================================================================
-- ACL set_seating_party_size (3/3): GRANT a authenticated
-- =============================================================================
-- Unico chiamante: la dashboard (utente autenticato). Il gate reale è dentro
-- la funzione: `has_permission('seatings.manage', activity_id)` → 42501.
--
-- Verifica post-deploy (attesi: authenticated=true, anon=false,
-- service_role=false):
--
--   SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
--   WHERE n.nspname = 'public' AND p.proname = 'set_seating_party_size'
--   ORDER BY 1, 2;
--
-- E per la view (attesa una riga con security_invoker=on):
--
--   SELECT c.relname, c.reloptions
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname = 'v_seatings_with_state';

GRANT EXECUTE ON FUNCTION public.set_seating_party_size(uuid, int)
TO authenticated;
