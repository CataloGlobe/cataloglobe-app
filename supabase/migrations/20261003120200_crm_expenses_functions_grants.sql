-- =============================================================================
-- CRM interno: sezione costi, privilegi delle funzioni (20261003120100)
-- =============================================================================
-- In un file a parte: CREATE FUNCTION e REVOKE/GRANT nello stesso file fanno
-- fallire `supabase db push` (42601).
-- Addebiti e prossimi rinnovi: li legge /admin/costi (le policy di
-- crm_expenses lasciano vedere le righe solo agli admin di piattaforma).
-- Rinnovi da ricordare: solo crm-notify (service role) e il cron (postgres).
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.crm_expense_charges(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_expense_charges(date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.crm_expense_next_charges(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_expense_next_charges(date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.crm_expense_renewals_due(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_expense_renewals_due(date) TO service_role;
