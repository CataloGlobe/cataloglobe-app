-- =============================================================================
-- CRM interno (F1-8): ACL delle funzioni di 20261004050100
-- =============================================================================
-- Tutte solo service_role (webhook di Telegram). Il client di /admin legge
-- crm_gea_inbox con la RLS, non chiama queste funzioni.
-- =============================================================================

REVOKE ALL ON FUNCTION public.crm_gea_receive(uuid, text, bigint, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_receive(uuid, text, bigint, bigint, text) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_claim(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_claim(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_finish(uuid, text, text, text, text, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_finish(uuid, text, text, text, text, numeric, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_confirm(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_confirm(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_log(uuid, text, text, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_log(uuid, text, text, uuid, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_find_venues(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_find_venues(text) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_venue_card(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_venue_card(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_pipeline() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_pipeline() TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_agenda(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_agenda(timestamptz, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_stale(integer) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_today() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_today() TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_add_note(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_add_note(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_mask(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_mask(text) TO service_role;
