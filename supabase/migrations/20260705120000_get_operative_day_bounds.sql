-- get_operative_day_bounds(p_date date)
--
-- Restituisce i bounds half-open [day_start, day_end) di una giornata
-- operativa arbitraria (data civile Europe/Rome), calcolati server-side.
-- DST-aware, stesso pattern di get_operative_day_start() (migration
-- 20260601150000):
--   date_trunc('day', <p_date come timestamp>) AT TIME ZONE 'Europe/Rome'
-- - p_date::timestamp = mezzanotte wall-clock della data (senza tz).
-- - date_trunc('day', ...) ridondante ma tenuta per parità col pattern.
-- - ... AT TIME ZONE 'Europe/Rome' reinterpreta quella mezzanotte come
--   istante UTC, scegliendo l'offset DST giusto per QUELLA data.
--
-- day_end = mezzanotte del giorno successivo (p_date + 1): l'intervallo
-- [day_start, day_end) copre correttamente 23/24/25 ore reali ai cambi
-- DST (29/3 CET→CEST, 25/10 CEST→CET) perché i due bordi sono calcolati
-- ciascuno col proprio offset locale.
--
-- Generalizza get_operative_day_start (che resta per i KPI "oggi"). Usata
-- dallo Storico ordini per navigare i giorni precedenti (service
-- listOrdersHistory). Puro calcolo data: nessun accesso a tabelle tenant,
-- nessun tenant-guard necessario. Stesso hardening del sibling.
--
-- p_date ha DEFAULT = data civile "oggi" Europe/Rome, così la chiamata
-- senza argomenti ritorna i bounds di oggi (server-side, mai calcolati in
-- JS: evita il rischio DST e mantiene un solo punto di verità sul confine).
--
-- TODO multi-region: quando i tenant non-IT useranno l'epic ordering,
-- parametrizzare il timezone via `activities.iana_timezone`. Per ora
-- hardcoded 'Europe/Rome' coerente con tutto lo scheduling stack.

CREATE OR REPLACE FUNCTION public.get_operative_day_bounds(
    p_date date DEFAULT (now() AT TIME ZONE 'Europe/Rome')::date
)
RETURNS TABLE(day_start timestamptz, day_end timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT
        date_trunc('day', p_date::timestamp) AT TIME ZONE 'Europe/Rome',
        date_trunc('day', (p_date + 1)::timestamp) AT TIME ZONE 'Europe/Rome';
$$;

REVOKE EXECUTE ON FUNCTION public.get_operative_day_bounds(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_operative_day_bounds(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_operative_day_bounds(date) TO authenticated;
