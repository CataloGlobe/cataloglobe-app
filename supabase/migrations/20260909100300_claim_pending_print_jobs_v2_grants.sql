-- =============================================================================
-- claim_pending_print_jobs v2 — grant (file separato, regola 42601)
-- =============================================================================
--
-- Il DROP (20260909100100) ha perso i grant precedenti. SECURITY DEFINER non
-- destinata a anon/authenticated: REVOKE FROM PUBLIC non basta (Supabase
-- pre-configura grant a anon, authenticated, service_role). REVOKE espliciti
-- + GRANT solo a service_role.
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) TO service_role;
