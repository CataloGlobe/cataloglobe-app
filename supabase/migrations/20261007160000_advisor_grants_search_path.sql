-- Advisor di sicurezza di staging (2026-10-07): correzioni che non cambiano
-- il comportamento dell'app.
--
-- 1. Funzioni trigger SECURITY DEFINER eseguibili via /rest/v1/rpc da anon e
--    authenticated. Un trigger non si chiama da PostgREST (fallisce subito con
--    "trigger functions can only be called as triggers"), ma l'avviso resta e
--    la superficie è inutile. Il privilegio EXECUTE si controlla solo a
--    CREATE TRIGGER, non quando il trigger scatta: i trigger esistenti
--    continuano a funzionare.
-- 2. delete_my_otp_verification: senza login lancia not_authenticated; anon
--    non ha motivo di chiamarla. AuthProvider la chiama prima del signOut,
--    quindi da authenticated.
-- 3. search_path fisso sulle funzioni segnalate da function_search_path_mutable.
--    Sono SECURITY INVOKER (analytics_*) o usano nomi qualificati
--    (purge_user_data): `public` è lo stesso percorso che vedono oggi.
--
-- Non toccate qui (solo nel report): accept/decline_invite_by_token,
-- get_user_tenants, le RPC pensate per anon (resolve_table_by_token,
-- get_tenant_public_info, get_public_tenant_ids, get_invite_info_by_token).

-- 1. Funzioni trigger
REVOKE EXECUTE ON FUNCTION public.check_activity_feature_flags() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.close_empty_unverified_group() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_ai_quota_on_translation_job() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_feature_table_ordering_on_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_feature_table_reservation_on_reservations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_order_group_verification() FROM PUBLIC, anon, authenticated;

-- 2. RPC che richiede il login
REVOKE EXECUTE ON FUNCTION public.delete_my_otp_verification() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_otp_verification() TO authenticated;

-- 3. search_path
ALTER FUNCTION public.purge_user_data(uuid) SET search_path = public;
ALTER FUNCTION public.analytics_orders_overview(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.analytics_orders_trend(uuid, timestamptz, timestamptz, uuid, text) SET search_path = public;
ALTER FUNCTION public.analytics_orders_hourly(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.analytics_top_ordered_products(uuid, timestamptz, timestamptz, uuid, int, text) SET search_path = public;
ALTER FUNCTION public.analytics_orders_latency(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.analytics_orders_conversion(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.analytics_reservations_overview(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
ALTER FUNCTION public.analytics_reservations_trend(uuid, timestamptz, timestamptz, uuid, text) SET search_path = public;
ALTER FUNCTION public.analytics_reservations_hourly(uuid, timestamptz, timestamptz, uuid) SET search_path = public;
