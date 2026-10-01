-- =============================================================================
-- CRM interno (Fase 0): ACL di 20261001160000
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- Cancella dati: solo service_role (edge crm-purge), mai dal client.

REVOKE ALL ON FUNCTION public.crm_purge_venues(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_purge_venues(timestamptz, boolean) TO service_role;
