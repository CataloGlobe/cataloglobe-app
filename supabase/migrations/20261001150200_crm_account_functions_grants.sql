-- =============================================================================
-- CRM interno (Fase 0): ACL di 20261001150100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).

REVOKE ALL ON FUNCTION public.crm_link_account(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_link_account(uuid, uuid, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_unlink_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_unlink_account(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_sync_account_state(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_sync_account_state(uuid, text, text, timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.crm_move_stage_locked(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_move_stage_locked(uuid, text, text) TO authenticated;

REVOKE ALL ON FUNCTION public.crm_unlock_stage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_unlock_stage(uuid) TO authenticated;
