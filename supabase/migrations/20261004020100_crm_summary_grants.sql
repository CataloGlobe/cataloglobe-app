-- =============================================================================
-- CRM interno (F1-9): ACL di crm_summary (20261004020000)
-- =============================================================================
-- authenticated + service_role: la funzione rifiuta da sola chi non è admin di
-- piattaforma, e le RLS delle crm_* fanno lo stesso.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_summary(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_summary(timestamptz, timestamptz) TO authenticated, service_role;
