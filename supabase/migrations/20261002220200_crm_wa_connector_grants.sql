-- =============================================================================
-- CRM interno (Fase 1, F1-2): ACL delle funzioni di 20261002220000/220100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- REVOKE FROM PUBLIC non basta: Supabase dà EXECUTE di default ad anon e
-- authenticated, quindi si revoca esplicitamente.
--
-- ACL attesa:
--   crm_e164_list_ok, crm_wa_is_quiet
--       authenticated + service_role (pure; la prima la usa il CHECK di
--       crm_settings quando una persona salva la lista dei numeri di prova)
--   crm_set_agent_hold, crm_wa_cancel_message
--       authenticated + service_role (/admin; le RLS lasciano passare solo
--       gli admin di piattaforma)
--   crm_wa_claim_next, crm_wa_report_result, crm_wa_heartbeat,
--   crm_wa_ingest_chat, crm_wa_watchdog
--       solo service_role: le chiama l'edge crm-wa-worker
--   crm_purge_messages
--       solo service_role: la chiama l'edge crm-purge
--   crm_messages_guard, crm_wa_enqueue_first_message, crm_settings_wa_log,
--   crm_wa_reset_on_release
--       nessuno: sono funzioni trigger (il trigger gira comunque)
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_e164_list_ok(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_e164_list_ok(text[]) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_wa_is_quiet(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_wa_is_quiet(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_set_agent_hold(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_agent_hold(uuid, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_wa_cancel_message(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_wa_cancel_message(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_wa_claim_next(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_claim_next(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_wa_report_result(uuid, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_report_result(uuid, boolean, text, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_wa_heartbeat(text, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_heartbeat(text, text, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_wa_ingest_chat(text, jsonb, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_ingest_chat(text, jsonb, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_wa_watchdog(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_watchdog(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_messages_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_wa_enqueue_first_message() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_settings_wa_log() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_wa_reset_on_release() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.crm_purge_messages(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_purge_messages(timestamptz, boolean) TO service_role;
