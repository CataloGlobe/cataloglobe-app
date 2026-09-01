-- =========================================
-- RESERVATIONS — Estrazione (7/7): GRANT sulla lettura di disponibilità
-- =========================================
-- Unico chiamante legittimo: la futura Edge function pubblica di
-- disponibilità, che gira con client service_role e applica i gate.
--
-- Verifica post-deploy (attesa: solo service_role a true):
--
--   SELECT r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puo_eseguire
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
--   WHERE n.nspname = 'public'
--     AND p.proname IN ('get_reservation_day_availability',
--                       'reservation_peak_with_candidate',
--                       'reservation_pacing_block');
--
-- I due helper devono risultare false su TUTTI E TRE i ruoli: sono raggiunti
-- solo attraverso le funzioni SECURITY DEFINER che li chiamano.

GRANT EXECUTE ON FUNCTION public.get_reservation_day_availability(
    uuid, date, int, time[]
) TO service_role;
