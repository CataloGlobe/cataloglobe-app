-- =============================================================================
-- CRM interno: ACL delle funzioni di 20261004010600
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- crm_call_ask_creator solo dall'edge (il tasto vive su Telegram).
-- crm_handover_call e crm_call_propose_other rifatte con la stessa firma:
-- ACL ribadite come in 20261004010500.
BEGIN;

REVOKE ALL ON FUNCTION public.crm_call_ask_creator(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_call_ask_creator(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_handover_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_handover_call(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_call_propose_other(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_call_propose_other(uuid, text, uuid) TO service_role;

COMMIT;
