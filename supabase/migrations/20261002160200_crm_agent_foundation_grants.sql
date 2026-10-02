-- =============================================================================
-- CRM interno (Fase 1, F1-1): ACL delle funzioni di 20261002160100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- REVOKE FROM PUBLIC non basta: Supabase dà EXECUTE di default ad anon e
-- authenticated, quindi si revoca esplicitamente.
--
-- ACL attesa:
--   crm_agent_actor, crm_bind_agent_actor
--       authenticated + service_role (le chiamano i trigger e le funzioni
--       SECURITY INVOKER col ruolo di chi scrive; dal client valgono solo
--       per sé stessi)
--   crm_set_brake, crm_ai_spend, crm_ai_gate,
--   crm_propose_brand_rules, crm_approve_brand_rules, crm_discard_brand_rules
--       authenticated + service_role (le RLS lasciano passare solo gli admin
--       di piattaforma; il service role serve alle edge del CRM)
--   crm_record_ai_usage
--       solo service_role: il registro dei costi lo scrivono le edge
--   crm_settings_agent_guard, crm_settings_agent_log,
--   crm_brand_rules_guard, crm_brand_rules_log
--       nessuno: sono funzioni trigger (il trigger gira comunque)
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_agent_actor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_agent_actor() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_bind_agent_actor(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_bind_agent_actor(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_set_brake(boolean, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_brake(boolean, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_ai_spend() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_ai_spend() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_ai_gate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_ai_gate(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_record_ai_usage(
    text, text, integer, integer, integer, integer, numeric, text, boolean, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_record_ai_usage(
    text, text, integer, integer, integer, integer, numeric, text, boolean, text, uuid, uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.crm_propose_brand_rules(text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_propose_brand_rules(text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_approve_brand_rules(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_approve_brand_rules(integer, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_discard_brand_rules(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_discard_brand_rules(integer, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_settings_agent_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_settings_agent_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_brand_rules_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_brand_rules_log() FROM PUBLIC, anon, authenticated;
