-- =============================================================================
-- CRM: permessi di crm_move_stage con la firma nuova (p_confirm_stop)
-- =============================================================================
--
-- File a parte: CREATE FUNCTION e REVOKE/GRANT insieme fanno fallire
-- `supabase db push` (42601). Stessi permessi della firma vecchia
-- (20261001120200): niente ad anon, client e edge sì.
-- Le altre funzioni di 20261006200000 sono CREATE OR REPLACE e tengono i
-- permessi che avevano.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_move_stage(uuid, text, text, text, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_move_stage(uuid, text, text, text, text, uuid, boolean) TO authenticated, service_role;
