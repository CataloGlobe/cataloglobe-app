-- Gea 2: grant delle tre letture nuove (20261005120000), solo service role.
REVOKE ALL ON FUNCTION public.crm_gea_pending_drafts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_pending_drafts() TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_venue_chat(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_venue_chat(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.crm_gea_diary(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_gea_diary(integer) TO service_role;
