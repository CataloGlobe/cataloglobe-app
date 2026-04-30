-- =============================================================================
-- PR2B-fix: REVOKE EXECUTE FROM PUBLIC su 2 RPC con grant ereditato
-- =============================================================================
-- La migration 20260429170000 ha REVOKED da anon, ma queste 2 funzioni
-- mantengono il grant ereditato da PUBLIC (default Postgres).
--
-- Stessa diagnosi del fix 20260429160000 (trigger functions).
--
-- get_my_pending_invites() e get_tenant_members(uuid) restano callable
-- da authenticated (grant esplicito mantenuto). Solo PUBLIC viene rimosso
-- per chiudere il warning anon_security_definer_function_executable.
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM PUBLIC;

COMMIT;
