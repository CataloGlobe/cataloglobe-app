-- =============================================================================
-- CRM interno (Fase 0): ACL di crm_start_telegram_link (20261001130100)
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).

REVOKE ALL ON FUNCTION public.crm_start_telegram_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_start_telegram_link(text) TO authenticated;
