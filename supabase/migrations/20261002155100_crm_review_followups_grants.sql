-- =============================================================================
-- CRM interno (Fase 0): ACL di crm_leads_refresh_name_to_verify (20261002155000)
-- =============================================================================
-- File separato: CREATE FUNCTION + REVOKE/GRANT nello stesso file fa fallire
-- `supabase db push` con 42601. Gira solo come trigger: nessun ruolo la chiama.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_leads_refresh_name_to_verify() FROM PUBLIC, anon, authenticated;
