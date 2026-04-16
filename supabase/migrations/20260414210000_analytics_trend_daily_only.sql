-- Fix granularità grafico visite: sempre 'day', rimossa logica week/day dinamica.
-- La granularità settimanale causava un unico punto aggregato con pochi dati
-- concentrati in una sola settimana (es. durante onboarding/test iniziali).
-- Il parametro p_granularity è mantenuto per compatibilità ma ignorato.
CREATE OR REPLACE FUNCTION public.analytics_page_views_trend(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (date TEXT, count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      TO_CHAR(DATE_TRUNC('day', ae.created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::BIGINT AS count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'page_view'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    GROUP BY DATE_TRUNC('day', ae.created_at)
    ORDER BY DATE_TRUNC('day', ae.created_at);
END;
$$;
