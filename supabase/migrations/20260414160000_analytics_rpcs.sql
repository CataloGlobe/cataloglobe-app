-- RPC functions for analytics dashboard aggregations.
-- All use SECURITY INVOKER so RLS on analytics_events is enforced.

-- 1. Page views trend (daily or weekly buckets)
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
      TO_CHAR(DATE_TRUNC(p_granularity, ae.created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::BIGINT AS count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'page_view'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    GROUP BY DATE_TRUNC(p_granularity, ae.created_at)
    ORDER BY DATE_TRUNC(p_granularity, ae.created_at);
END $$;

-- 2. Top viewed products (from product_detail_open metadata)
CREATE OR REPLACE FUNCTION public.analytics_top_viewed_products(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (product_name TEXT, view_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'product_name')::TEXT AS product_name,
      COUNT(*)::BIGINT AS view_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'product_detail_open'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'product_name' IS NOT NULL
    GROUP BY ae.metadata->>'product_name'
    ORDER BY view_count DESC
    LIMIT p_limit;
END $$;

-- 3. Top selected products (from selection_add metadata)
CREATE OR REPLACE FUNCTION public.analytics_top_selected_products(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (product_name TEXT, selection_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'product_name')::TEXT AS product_name,
      COUNT(*)::BIGINT AS selection_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'selection_add'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'product_name' IS NOT NULL
    GROUP BY ae.metadata->>'product_name'
    ORDER BY selection_count DESC
    LIMIT p_limit;
END $$;

-- 4. Overview stats (total views, unique sessions, avg events per session)
CREATE OR REPLACE FUNCTION public.analytics_overview_stats(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (total_views BIGINT, unique_sessions BIGINT, avg_events_per_session NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    WITH base AS (
      SELECT ae.session_id, ae.event_type
      FROM analytics_events ae
      WHERE ae.tenant_id = p_tenant_id
        AND ae.created_at >= p_from
        AND ae.created_at <= p_to
        AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    ),
    session_counts AS (
      SELECT b.session_id, COUNT(*) AS event_count
      FROM base b
      WHERE b.session_id IS NOT NULL
      GROUP BY b.session_id
    )
    SELECT
      (SELECT COUNT(*) FROM base WHERE event_type = 'page_view')::BIGINT AS total_views,
      (SELECT COUNT(DISTINCT session_id) FROM base WHERE session_id IS NOT NULL)::BIGINT AS unique_sessions,
      COALESCE((SELECT ROUND(AVG(event_count), 1) FROM session_counts), 0)::NUMERIC AS avg_events_per_session;
END $$;
