-- =============================================================================
-- PR2A-fix: REVOKE EXECUTE FROM PUBLIC su 6 funzioni con grant ereditato
-- =============================================================================
-- La migration 20260429150000 aveva REVOKED da anon, authenticated, ma queste
-- 6 funzioni mantengono il grant ereditato da PUBLIC (default Postgres).
-- Questo va completato con un REVOKE FROM PUBLIC.
--
-- Tutte e 6 sono trigger functions o RPC edge-only chiamate via service_role:
-- la rimozione di PUBLIC NON impatta runtime perché:
--   - I trigger sono invocati dal trigger system come owner (postgres),
--     non via EXECUTE ACL
--   - increment_otp_attempt è chiamata solo da verify-otp Edge Function
--     con service_role (che mantiene grant esplicito)
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.enforce_seat_limit() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_membership() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_otp_attempt(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM PUBLIC;

COMMIT;
