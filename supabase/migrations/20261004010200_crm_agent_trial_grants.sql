-- =============================================================================
-- CRM interno (Fase 1, F1-3): ACL delle funzioni di 20261004010000/010100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
--
-- ACL attesa:
--   crm_agent_is_night                 authenticated + service_role (pura)
--   crm_agent_decide_draft,
--   crm_agent_mark_stop                solo service_role: le chiamano il webhook
--                                      di Telegram e l'edge crm-agent, con
--                                      l'attore verificato da crm_bind_agent_actor
--   crm_agent_has_work                 postgres (cron) e service_role
--   crm_wa_claim_next                  invariata: solo service_role
--   crm_wa_enqueue_first_message,
--   crm_agent_drafts_touch             nessuno: funzioni trigger
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_agent_is_night(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_agent_is_night(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_agent_decide_draft(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_decide_draft(uuid, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_agent_mark_stop(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_mark_stop(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.crm_agent_has_work(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agent_has_work(timestamptz) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.crm_wa_claim_next(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_claim_next(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_wa_enqueue_first_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_agent_drafts_touch() FROM PUBLIC, anon, authenticated;
