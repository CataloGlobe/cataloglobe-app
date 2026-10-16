-- =============================================================================
-- Privilegi di 20261016120000 (separati: CREATE FUNCTION e GRANT nello stesso
-- file fanno fallire db push, 42601). Tabelle come le sorelle crm_expenses e
-- crm_expense_settlements, ma prima si toglie tutto anche ad authenticated
-- (i privilegi di default dello schema darebbero anche UPDATE e TRUNCATE);
-- funzioni copiate alla lettera da 20261003120200.
-- =============================================================================

REVOKE ALL ON TABLE public.crm_expense_accounts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.crm_expense_accounts TO authenticated;

REVOKE ALL ON TABLE public.crm_expense_terms FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.crm_expense_terms TO authenticated;

REVOKE ALL ON TABLE public.crm_expense_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.crm_expense_refunds TO authenticated;

-- Funzione di trigger: nessuno la chiama direttamente.
REVOKE EXECUTE ON FUNCTION public.crm_expense_terms_check() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.crm_expense_charges(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_expense_charges(date) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.crm_expense_renewals_due(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_expense_renewals_due(date) TO service_role;
