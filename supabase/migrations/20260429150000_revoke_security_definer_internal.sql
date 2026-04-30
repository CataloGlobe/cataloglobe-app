-- =============================================================================
-- PR2A: REVOKE EXECUTE da anon/authenticated su funzioni SECURITY DEFINER
-- non callable dal frontend
-- =============================================================================
-- Risolve ~34 warning Supabase advisor "*_security_definer_function_executable"
-- (17 funzioni × 2 ruoli anon + authenticated).
--
-- Funzioni interne, trigger, e RPC edge-only NON devono essere callable da
-- utenti autenticati (anon/authenticated). Mantenere grant solo a service_role
-- e postgres (default).
--
-- ESCLUSE INTENZIONALMENTE da questa migration:
-- - get_my_tenant_ids()        → usata da ~150 policy RLS tenant-scoped.
--                                Caller authenticated DEVE poter eseguirla
--                                durante valutazione policy.
-- - get_public_tenant_ids()    → usata da 11 policy RLS "Public can read *"
--                                del sito pubblico. anon + authenticated
--                                devono restare grantati.
-- - get_user_tenants()         → backing della view public.user_tenants_view
--                                (SECURITY INVOKER). La view eredita i
--                                permessi del caller.
-- - 15 funzioni 🟢 RPC FRONTEND → review separata in PR2B (alcune potrebbero
--                                essere convertite a SECURITY INVOKER).
-- - enforce_seat_limit()       → INCLUSA QUI (è trigger; era esclusa solo da
--                                PR1 search_path per coordinare con review
--                                SECURITY DEFINER).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Categoria 1: 🔵 RPC EDGE FUNCTION (callable solo via service_role)
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.clear_account_deleted(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_account_deletion_tenant_ops(jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_account_deleted(uuid) FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Categoria 2: 🟡 TRIGGER FUNCTION (callable solo dal trigger system)
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.enforce_seat_limit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_membership() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_tenant_system_group() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_profile_email() FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- Categoria 3: ⚪ INTERNAL (callable solo da altre DB functions o cron)
-- -----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.accept_tenant_invite(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_invite(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_old_invites() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_public_catalog(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_otp_attempt(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.purge_locked_expired_tenants() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.transfer_ownership(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unlock_owned_tenants(uuid) FROM anon, authenticated;

COMMIT;
