-- =============================================================================
-- CRM: indici sulle chiavi esterne, privilegi di tabella, permessi della RPC
-- =============================================================================
--
-- 1. Indici sulle FK che non ne avevano (elenco preso da staging il
--    2026-10-06): servono alle letture per lead/contatto e alle cancellazioni
--    a cascata della pulizia, che altrimenti scorrono la tabella intera.
--    Nomi *_fk_idx per non urtare quelli esistenti. Tabelle ancora piccole:
--    niente CONCURRENTLY (le migrazioni girano in transazione).
-- 2. Privilegi di tabella che nessuna policy permette: oggi l'RLS li ferma
--    già, il REVOKE è un secondo livello. Il client non li usa.
-- 3. Permessi di crm_set_default_assignee (20261006200400).
-- =============================================================================

CREATE INDEX IF NOT EXISTS crm_agent_decisions_lead_id_fk_idx ON public.crm_agent_decisions (lead_id);
CREATE INDEX IF NOT EXISTS crm_agent_draft_messages_user_id_fk_idx ON public.crm_agent_draft_messages (user_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_appointment_id_fk_idx ON public.crm_agent_drafts (appointment_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_contact_id_fk_idx ON public.crm_agent_drafts (contact_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_decision_id_fk_idx ON public.crm_agent_drafts (decision_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_lead_id_fk_idx ON public.crm_agent_drafts (lead_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_message_id_fk_idx ON public.crm_agent_drafts (message_id);
CREATE INDEX IF NOT EXISTS crm_agent_drafts_trigger_message_id_fk_idx ON public.crm_agent_drafts (trigger_message_id);
CREATE INDEX IF NOT EXISTS crm_ai_usage_decision_id_fk_idx ON public.crm_ai_usage (decision_id);
CREATE INDEX IF NOT EXISTS crm_ai_usage_venue_id_fk_idx ON public.crm_ai_usage (venue_id);
CREATE INDEX IF NOT EXISTS crm_appointments_caller_user_id_fk_idx ON public.crm_appointments (caller_user_id);
CREATE INDEX IF NOT EXISTS crm_appointments_contact_id_fk_idx ON public.crm_appointments (contact_id);
CREATE INDEX IF NOT EXISTS crm_appointments_lead_id_fk_idx ON public.crm_appointments (lead_id);
CREATE INDEX IF NOT EXISTS crm_events_lead_id_fk_idx ON public.crm_events (lead_id);
CREATE INDEX IF NOT EXISTS crm_leads_contact_id_fk_idx ON public.crm_leads (contact_id);
CREATE INDEX IF NOT EXISTS crm_messages_contact_id_fk_idx ON public.crm_messages (contact_id);
CREATE INDEX IF NOT EXISTS crm_messages_decision_id_fk_idx ON public.crm_messages (decision_id);
CREATE INDEX IF NOT EXISTS crm_messages_draft_id_fk_idx ON public.crm_messages (draft_id);
CREATE INDEX IF NOT EXISTS crm_messages_lead_id_fk_idx ON public.crm_messages (lead_id);
CREATE INDEX IF NOT EXISTS crm_telegram_messages_user_id_fk_idx ON public.crm_telegram_messages (user_id);

REVOKE DELETE ON public.crm_account_suggestions FROM authenticated;
REVOKE UPDATE, DELETE ON public.crm_events FROM authenticated;
REVOKE UPDATE ON public.crm_expense_settlements FROM authenticated;
REVOKE INSERT, DELETE ON public.crm_settings FROM authenticated;
REVOKE DELETE ON public.crm_weekly_goals FROM authenticated;

REVOKE ALL ON FUNCTION public.crm_set_default_assignee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_set_default_assignee(uuid) TO authenticated, service_role;
