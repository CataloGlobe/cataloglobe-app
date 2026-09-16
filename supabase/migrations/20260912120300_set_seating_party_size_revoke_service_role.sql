-- =============================================================================
-- ACL set_seating_party_size (2/3): REVOKE da service_role
-- =============================================================================
-- Nessuna Edge function la chiama: è un gesto dell'host in dashboard. Sotto
-- service_role `auth.uid()` è NULL e `has_permission` risponde false, quindi
-- fallirebbe comunque con 42501: il REVOKE la toglie dall'elenco di ciò che
-- quel ruolo può tentare. Come 20260911130600.

REVOKE ALL ON FUNCTION public.set_seating_party_size(uuid, int)
FROM service_role;
