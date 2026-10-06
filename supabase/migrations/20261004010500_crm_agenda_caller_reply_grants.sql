-- =============================================================================
-- CRM interno: ACL delle funzioni di 20261004010400
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- crm_handover_call come crm_answer_call (scheda ed edge). crm_call_propose_other
-- solo dall'edge: scrive una bozza, e le bozze dal client si leggono e basta.
BEGIN;

REVOKE ALL ON FUNCTION public.crm_handover_call(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_handover_call(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.crm_call_propose_other(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_call_propose_other(uuid, text, uuid) TO service_role;

COMMIT;
