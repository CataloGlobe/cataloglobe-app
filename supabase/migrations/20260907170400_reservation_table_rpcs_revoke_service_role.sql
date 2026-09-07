-- =============================================================================
-- ACL gesti operatore (2/3): REVOKE da service_role
-- =============================================================================
-- Nessuna Edge function le chiama: sono gesti dell'operatore in dashboard.
-- Sotto service_role `auth.uid()` è NULL e `has_permission` risponde false,
-- quindi fallirebbero comunque con 42501: il REVOKE toglie la funzione
-- dall'elenco di ciò che quel ruolo può tentare. Come 20260827140003.

REVOKE ALL ON FUNCTION
    public.set_reservation_tables(uuid, uuid[]),
    public.reset_reservation_tables_to_system(uuid),
    public.reassign_activity_tables(uuid, date)
FROM service_role;
