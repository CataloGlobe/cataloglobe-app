-- =============================================================================
-- PR2B: REVOKE EXECUTE FROM anon su 10 RPC SECURITY DEFINER che richiedono
-- auth.uid()
-- =============================================================================
-- Risolve 10 warning Supabase advisor "anon_security_definer_function_executable".
--
-- Tutte e 10 le funzioni richiedono internamente auth.uid() IS NOT NULL:
-- una chiamata da anon fallirebbe comunque a runtime, quindi REVOKE FROM anon
-- è zero-impact e chiude il warning.
--
-- Le funzioni RESTANO callable da authenticated (sono RPC frontend post-login).
--
-- Le 5 RPC anon-callable legittime NON sono in questa migration:
-- - accept_invite_by_token, decline_invite_by_token, get_invite_info_by_token
--   (flow invito via link email, anon legittimo)
-- - get_tenant_public_info (pagina pubblica del tenant)
-- - get_schedule_featured_contents (pagina pubblica catalogo)
-- =============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION public.change_member_role(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_deleted_tenants() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_pending_invites() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_tenant_members(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.invite_tenant_member(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.leave_tenant(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_tenant_member(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.resend_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.revoke_invite(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_tenant_logo(uuid, text) FROM anon;

COMMIT;
