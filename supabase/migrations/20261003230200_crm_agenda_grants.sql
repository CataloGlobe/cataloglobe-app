-- =============================================================================
-- CRM interno (Fase 1, F1-4a): ACL delle funzioni di 20261003230000/230100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- REVOKE FROM PUBLIC non basta: Supabase dà EXECUTE di default ad anon e
-- authenticated, quindi si revoca esplicitamente.
--
-- ACL attesa:
--   crm_call_windows_ok, crm_call_reminder_at
--       authenticated + service_role (pure; la prima la usa il CHECK di
--       crm_settings quando una persona salva le fasce)
--   crm_schedule_call, crm_move_call, crm_cancel_call, crm_answer_call,
--   crm_set_call_outcome
--       authenticated + service_role (/admin e webhook Telegram con attore;
--       crm_agenda_begin rifiuta chi non è admin di piattaforma)
--   crm_agenda_begin, crm_agenda_check_slot, crm_call_advance_stage
--       authenticated + service_role: aiuti delle funzioni qui sopra, che
--       sono SECURITY INVOKER e quindi li chiamano coi privilegi di chi agisce
--   crm_agenda_enqueue_reminders, crm_agenda_has_work, crm_agenda_expire
--       solo postgres (cron) e service_role
--   crm_wa_claim_next, crm_wa_report_result
--       invariate: solo service_role (rifatte con CREATE OR REPLACE, l'ACL
--       resta; riscritta qui per chiarezza)
--   crm_appointments_guard, crm_appointments_queue
--       nessuno: sono funzioni trigger
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_call_windows_ok(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_call_windows_ok(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_call_reminder_at(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_call_reminder_at(timestamptz) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_schedule_call(uuid, timestamptz, integer, uuid, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_schedule_call(uuid, timestamptz, integer, uuid, text, boolean, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_move_call(uuid, timestamptz, integer, uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_move_call(uuid, timestamptz, integer, uuid, boolean, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_cancel_call(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_cancel_call(uuid, text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_answer_call(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_answer_call(uuid, boolean, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_set_call_outcome(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_call_outcome(uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_agenda_begin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_agenda_begin(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_agenda_check_slot(timestamptz, timestamptz, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_agenda_check_slot(timestamptz, timestamptz, uuid, uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_call_advance_stage(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_call_advance_stage(uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_agenda_enqueue_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agenda_enqueue_reminders(timestamptz) TO postgres, service_role;
REVOKE ALL ON FUNCTION public.crm_agenda_expire(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agenda_expire(timestamptz) TO postgres, service_role;
REVOKE ALL ON FUNCTION public.crm_agenda_has_work(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_agenda_has_work(timestamptz) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.crm_wa_claim_next(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_claim_next(timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.crm_wa_report_result(uuid, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_wa_report_result(uuid, boolean, text, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_appointments_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.crm_appointments_queue() FROM PUBLIC, anon, authenticated;
