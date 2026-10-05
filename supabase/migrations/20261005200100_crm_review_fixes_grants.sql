-- =============================================================================
-- Grant della funzione nuova di 20261005200000 (file a parte: CREATE FUNCTION
-- e REVOKE nello stesso file fanno fallire db push, docs/patterns/storage-sql.md).
--   crm_purge_gea_inbox
--       solo service_role: la chiama l'edge crm-purge
-- Le funzioni rifatte con CREATE OR REPLACE tengono i loro grant.
-- =============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.crm_purge_gea_inbox(timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_purge_gea_inbox(timestamptz, boolean) TO service_role;

COMMIT;
