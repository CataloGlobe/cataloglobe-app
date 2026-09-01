-- =========================================
-- RESERVATIONS — Pacing (4/4): GRANT
-- =========================================
-- Unico chiamante legittimo: l'Edge function `submit-reservation`, che gira
-- con client service_role. Nessun percorso frontend chiama questa RPC.
--
-- Verifica post-deploy (deve restituire una riga sola, service_role = true):
--
--   SELECT r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS puo_eseguire
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role')) AS r(rolname)
--   WHERE n.nspname = 'public' AND p.proname = 'place_online_reservation';

GRANT EXECUTE ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) TO service_role;
