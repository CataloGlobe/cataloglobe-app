-- =============================================================================
-- CRM interno (Fase 0): ACL di 20261001170000
-- =============================================================================
-- File separato dalla CREATE FUNCTION (42601 con `supabase db push`).
-- crm_ingest_lead mantiene le ACL della 20261001120200 (CREATE OR REPLACE non
-- le tocca).

REVOKE ALL ON FUNCTION public.crm_rename_venue(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_rename_venue(uuid, text, text) TO authenticated;
