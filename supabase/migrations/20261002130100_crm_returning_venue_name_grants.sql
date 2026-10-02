-- =============================================================================
-- ACL delle funzioni di 20261002130000 (file a parte: 42601 con db push)
-- =============================================================================
-- crm_ingest_lead e crm_rename_venue: CREATE OR REPLACE conserva i privilegi
-- di 20261001120200 e 20261001170100, niente da rifare.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_venue_name_match(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_venue_name_match(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.crm_resolve_venue_name(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_resolve_venue_name(uuid, text, uuid) TO authenticated, service_role;
