-- =============================================================================
-- CRM interno (Fase 0): ACL di crm_log_whatsapp_opened (20261001140000)
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).

REVOKE ALL ON FUNCTION public.crm_log_whatsapp_opened(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_log_whatsapp_opened(uuid, uuid, uuid) TO authenticated, service_role;
