-- =============================================================================
-- ACL gesti operatore (3/3): GRANT a authenticated
-- =============================================================================
-- Unico chiamante: la dashboard (utente autenticato). Il gate reale è dentro
-- ogni funzione: `has_permission('reservations.manage', activity_id)` → 42501.
--
-- Verifica post-deploy (attesi: authenticated=true, anon=false, service_role=false
-- per ciascuna delle tre):
--
--   SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('set_reservation_tables','reset_reservation_tables_to_system','reassign_activity_tables')
--   ORDER BY 1, 2;

GRANT EXECUTE ON FUNCTION
    public.set_reservation_tables(uuid, uuid[]),
    public.reset_reservation_tables_to_system(uuid),
    public.reassign_activity_tables(uuid, date)
TO authenticated;
