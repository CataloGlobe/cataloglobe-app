-- 20260606130000_add_get_daily_uptime_rpc.sql
--
-- Aggregazione server-side della status page barra 90gg.
--
-- Motivazione: `listDailyUptime` in src/services/supabase/statusPage.ts
-- faceva SELECT con ORDER BY ASC senza LIMIT, colpendo il cap PostgREST
-- (1000 righe) → ricevuti solo i 1000 record piu' vecchi della finestra
-- (~1.4 giorni). I 13+ giorni recenti finivano senza bucket → renderizzati
-- grigi ("nessun dato") nonostante i check esistessero nel DB. Riferimento
-- audit: turno precedente di questa stessa sessione.
--
-- Fix: aggregare nel DB e ritornare una riga per giorno (worst-of-day +
-- conteggio). Il frontend mantiene il fill-loop dei 90 slot e marca
-- "unknown" solo i giorni realmente senza dati.
--
-- Note design:
--   - SECURITY INVOKER (RLS su status_checks gia' consente SELECT anon,
--     vedi 20260520220000_create_status_tables.sql)
--   - SET search_path TO '' + qualifiche public.* esplicite
--   - Bucket UTC (checked_at AT TIME ZONE 'UTC')::date → match formato
--     toISOString().slice(0,10) usato lato client per coerenza visiva
--   - Worst rank up=0/degraded=1/down=2 replica il rank JS in statusPage.ts

CREATE OR REPLACE FUNCTION public.get_daily_uptime(
    p_service_key text,
    p_days integer DEFAULT 90
)
RETURNS TABLE (
    day date,
    worst text,
    check_count integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    WITH ranked AS (
        SELECT
            (checked_at AT TIME ZONE 'UTC')::date AS day,
            CASE status WHEN 'down' THEN 2 WHEN 'degraded' THEN 1 ELSE 0 END AS rank
        FROM public.status_checks
        WHERE service_key = p_service_key
          AND checked_at >= now() - make_interval(days => p_days)
    )
    SELECT
        day,
        CASE max(rank)
            WHEN 2 THEN 'down'
            WHEN 1 THEN 'degraded'
            ELSE 'up'
        END AS worst,
        count(*)::integer AS check_count
    FROM ranked
    GROUP BY day
    ORDER BY day;
$$;

REVOKE EXECUTE ON FUNCTION public.get_daily_uptime(text, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_daily_uptime(text, integer) TO anon, authenticated;
