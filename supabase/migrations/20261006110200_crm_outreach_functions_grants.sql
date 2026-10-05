-- =============================================================================
-- CRM, Fase 2 (F2-1): privilegi delle funzioni della base contatti.
-- File separato per il 42601 di `supabase db push` (CREATE FUNCTION + GRANT).
-- =============================================================================

-- Pura, senza dati: la può chiamare chi legge le impronte.
REVOKE ALL ON FUNCTION public.crm_email_fingerprint(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_email_fingerprint(text) TO authenticated, service_role;

-- Solo trigger.
REVOKE ALL ON FUNCTION public.crm_outreach_prospect_guard() FROM PUBLIC, anon, authenticated;

-- Controllano da sé admin di piattaforma o service role.
REVOKE ALL ON FUNCTION public.crm_suppress_email(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_suppress_email(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_is_email_suppressed(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_is_email_suppressed(text) TO authenticated, service_role;
