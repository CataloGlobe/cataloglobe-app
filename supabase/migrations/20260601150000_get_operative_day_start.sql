-- get_operative_day_start()
--
-- Restituisce l'istante (timestamptz) della mezzanotte locale "oggi" in
-- Europe/Rome, calcolata server-side. DST-aware:
--   date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome'
-- - now() AT TIME ZONE 'Europe/Rome' converte l'istante corrente in
--   timestamp (no tz) della wall-clock di Roma.
-- - date_trunc('day', ...) tronca a mezzanotte locale.
-- - ... AT TIME ZONE 'Europe/Rome' reinterpreta quella mezzanotte come
--   istante UTC, scegliendo l'offset DST giusto per la data corrente.
--
-- Usata dai KPI "ordini oggi" e "servite oggi" come confine inferiore
-- (>=) su submitted_at / delivered_at. Nessun cutoff orario custom: la
-- giornata operativa = giornata di calendario locale.
--
-- TODO multi-region: quando i tenant non-IT inizieranno a usare l'epic
-- ordering, parametrizzare il timezone leggendo `activities.iana_timezone`
-- (oppure derivare via tenant). Per ora hardcoded 'Europe/Rome' coerente
-- con tutto il resto dello scheduling stack.

CREATE OR REPLACE FUNCTION public.get_operative_day_start()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT date_trunc('day', now() AT TIME ZONE 'Europe/Rome')
        AT TIME ZONE 'Europe/Rome';
$$;

REVOKE EXECUTE ON FUNCTION public.get_operative_day_start() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_operative_day_start() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_operative_day_start() TO authenticated;
