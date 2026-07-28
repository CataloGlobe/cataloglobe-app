-- =============================================================================
-- get_ai_usage_current_cycle — REVOKE/GRANT dopo il DROP+CREATE di FASE 4
-- =============================================================================
--
-- File separato: FUNCTION + GRANT nello stesso file fallisce via supabase db
-- push (gotcha 42601). Il DROP in 110100 ha azzerato l'ACL precedente e il
-- CREATE ha ripristinato il default (EXECUTE a PUBLIC) → qui ri-blindiamo.
--
-- authenticated: barra consumi UI (access check interno limita al proprio tenant).
-- service_role: edge functions Gemini + trigger enforce_ai_quota (chiamata via
--   la stessa RPC, memoizzata per-transazione).
-- anon/PUBLIC: nessun accesso.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.get_ai_usage_current_cycle(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_ai_usage_current_cycle(uuid) TO authenticated, service_role;
