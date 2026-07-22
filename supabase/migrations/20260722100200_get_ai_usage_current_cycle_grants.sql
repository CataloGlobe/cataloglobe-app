-- =============================================================================
-- get_ai_usage_current_cycle — REVOKE/GRANT (file separato: gotcha 42601,
-- CREATE FUNCTION + GRANT nello stesso file fallisce via supabase db push)
-- =============================================================================
--
-- authenticated: barra consumi UI (l'access check interno via
--   get_my_tenant_ids limita al proprio tenant).
-- service_role: edge functions (enforcement futuro FASE 4).
-- anon/PUBLIC: nessun accesso.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_ai_usage_current_cycle(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ai_usage_current_cycle(uuid) TO authenticated, service_role;
