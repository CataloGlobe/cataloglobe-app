-- =============================================================================
-- CRM interno (Fase 0): ACL delle funzioni di 20261001120100
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- REVOKE FROM PUBLIC non basta: Supabase dà EXECUTE di default ad anon e
-- authenticated, quindi si revoca esplicitamente.
--
-- ACL attesa:
--   crm_ingest_lead, crm_move_stage, crm_assign, crm_add_note
--       authenticated + service_role (le RLS lasciano passare solo gli admin
--       di piattaforma; il service role serve alle edge del CRM)
--   crm_sync_landing_leads
--       solo postgres (pg_cron) e service_role
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_ingest_lead(
    text, text, text, text, text, text, text, text[], jsonb, text, text, text, timestamptz, text, timestamptz
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_ingest_lead(
    text, text, text, text, text, text, text, text[], jsonb, text, text, text, timestamptz, text, timestamptz
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_sync_landing_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_sync_landing_leads() TO service_role;

REVOKE ALL ON FUNCTION public.crm_move_stage(uuid, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_move_stage(uuid, text, text, text, text, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_assign(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_assign(uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_add_note(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_add_note(uuid, text) TO authenticated, service_role;
