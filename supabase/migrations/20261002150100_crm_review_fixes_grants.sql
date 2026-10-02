-- =============================================================================
-- CRM interno (Fase 0): ACL di crm_refresh_name_to_verify (20261002150000)
-- =============================================================================
-- File separato: CREATE FUNCTION + REVOKE/GRANT nello stesso file fa fallire
-- `supabase db push` con 42601. SECURITY INVOKER: le RLS `crm_*` restano il
-- cancello, come per le altre funzioni del CRM.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_refresh_name_to_verify(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_refresh_name_to_verify(uuid) TO authenticated, service_role;
