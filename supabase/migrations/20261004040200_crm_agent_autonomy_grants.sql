-- =============================================================================
-- CRM interno (F1-7): ACL delle funzioni di 20261004040100
-- =============================================================================
--   crm_agent_trust_refresh, crm_agent_auto_send   solo service_role (edge crm-agent)
--   crm_agent_trust_rules                          nessuno: funzione trigger
--   crm_agent_decide_draft                         invariata: solo service_role
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_agent_trust_refresh() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_trust_refresh() TO service_role;
REVOKE ALL ON FUNCTION public.crm_agent_auto_send(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_auto_send(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_agent_trust_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_agent_decide_draft(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_decide_draft(uuid, text, text, uuid) TO service_role;
