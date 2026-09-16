-- =============================================================================
-- ACL ciclo tavolata (3/3): GRANT a authenticated
-- =============================================================================
-- Unico chiamante: la dashboard (utente autenticato). Il gate reale è dentro
-- ogni funzione: `has_permission('seatings.manage', activity_id)` → 42501.
--
-- Verifica post-deploy (attesi: authenticated=true, anon=false,
-- service_role=false per ciascuna delle cinque):
--
--   SELECT p.proname, r.rolname, has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('open_seating_for_reservation','open_walkin_seating',
--                       'set_seating_tables','close_seating','undo_seating')
--   ORDER BY 1, 2;

GRANT EXECUTE ON FUNCTION
    public.open_seating_for_reservation(uuid),
    public.open_walkin_seating(uuid, uuid[], int),
    public.set_seating_tables(uuid, uuid[]),
    public.close_seating(uuid, text),
    public.undo_seating(uuid)
TO authenticated;
