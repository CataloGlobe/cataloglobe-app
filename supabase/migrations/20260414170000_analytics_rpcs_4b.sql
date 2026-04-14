-- Secondary analytics RPC functions (4B).
-- All use SECURITY INVOKER so RLS on analytics_events is enforced.

-- 1. Social click distribution
CREATE OR REPLACE FUNCTION public.analytics_social_clicks(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (social_type TEXT, click_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'social_type')::TEXT AS social_type,
      COUNT(*)::BIGINT AS click_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'social_click'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'social_type' IS NOT NULL
    GROUP BY ae.metadata->>'social_type'
    ORDER BY click_count DESC;
END $$;

-- 2. Review Guard metrics
CREATE OR REPLACE FUNCTION public.analytics_review_metrics(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_total BIGINT;
  v_avg_rating NUMERIC;
  v_google_redirects BIGINT;
  v_distribution JSON;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'review_submitted'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id);

  SELECT ROUND(AVG((ae.metadata->>'rating')::INT), 1) INTO v_avg_rating
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'review_submitted'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.metadata->>'rating' IS NOT NULL;

  SELECT COUNT(*) INTO v_google_redirects
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'review_google_redirect'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id);

  SELECT JSON_AGG(JSON_BUILD_OBJECT('stars', stars, 'count', star_count) ORDER BY stars DESC)
  INTO v_distribution
  FROM (
    SELECT
      (ae.metadata->>'rating')::INT AS stars,
      COUNT(*)::BIGINT AS star_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'review_submitted'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'rating' IS NOT NULL
      AND (ae.metadata->>'rating')::INT BETWEEN 1 AND 5
    GROUP BY (ae.metadata->>'rating')::INT
  ) sub;

  RETURN JSON_BUILD_OBJECT(
    'total', COALESCE(v_total, 0),
    'avg_rating', COALESCE(v_avg_rating, 0),
    'google_redirects', COALESCE(v_google_redirects, 0),
    'distribution', COALESCE(v_distribution, '[]'::JSON)
  );
END $$;

-- 3. Search rate (sessions with at least one search / total sessions)
CREATE OR REPLACE FUNCTION public.analytics_search_rate(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (search_sessions BIGINT, total_sessions BIGINT, rate NUMERIC)
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
        AND ae.session_id IS NOT NULL
    )
    SELECT
      COUNT(DISTINCT CASE WHEN b.event_type = 'search_performed' THEN b.session_id END)::BIGINT AS search_sessions,
      COUNT(DISTINCT b.session_id)::BIGINT AS total_sessions,
      CASE
        WHEN COUNT(DISTINCT b.session_id) = 0 THEN 0::NUMERIC
        ELSE ROUND(
          COUNT(DISTINCT CASE WHEN b.event_type = 'search_performed' THEN b.session_id END)::NUMERIC
          / COUNT(DISTINCT b.session_id)::NUMERIC * 100,
          1
        )
      END AS rate
    FROM base b;
END $$;

-- 4. Hourly distribution of page_view events (0-23)
CREATE OR REPLACE FUNCTION public.analytics_hourly_distribution(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (hour INT, view_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM ae.created_at)::INT AS hour,
      COUNT(*)::BIGINT AS view_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'page_view'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    GROUP BY EXTRACT(HOUR FROM ae.created_at)
    ORDER BY hour;
END $$;

-- 5. Device type distribution
CREATE OR REPLACE FUNCTION public.analytics_device_distribution(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (device_type TEXT, device_count BIGINT, percentage NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    WITH counts AS (
      SELECT ae.device_type, COUNT(DISTINCT ae.session_id)::BIGINT AS cnt
      FROM analytics_events ae
      WHERE ae.tenant_id = p_tenant_id
        AND ae.event_type = 'page_view'
        AND ae.created_at >= p_from
        AND ae.created_at <= p_to
        AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
        AND ae.device_type IS NOT NULL
      GROUP BY ae.device_type
    ),
    total AS (
      SELECT SUM(cnt) AS total_cnt FROM counts
    )
    SELECT
      c.device_type::TEXT,
      c.cnt AS device_count,
      CASE WHEN t.total_cnt = 0 THEN 0::NUMERIC
           ELSE ROUND(c.cnt::NUMERIC / t.total_cnt::NUMERIC * 100, 1)
      END AS percentage
    FROM counts c, total t
    ORDER BY c.cnt DESC;
END $$;
