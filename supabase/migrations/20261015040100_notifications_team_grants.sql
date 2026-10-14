BEGIN;

-- =============================================================================
-- NOTIFICHE TEAM: privilegi
-- =============================================================================
-- Separato da 20261015040000 per il limite di `db push` (SQLSTATE 42601).
-- La funzione del trigger non si chiama da fuori. expire_old_invites tiene i
-- privilegi che aveva (CREATE OR REPLACE non li tocca).

REVOKE ALL ON FUNCTION public.notify_tenant_membership_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_tenant_membership_change() FROM anon, authenticated;

COMMIT;
