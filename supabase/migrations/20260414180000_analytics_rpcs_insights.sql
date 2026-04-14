-- Analytics RPC functions for insights (4C).
-- All use SECURITY INVOKER so RLS on analytics_events is enforced.

-- 1. Top search terms
CREATE OR REPLACE FUNCTION public.analytics_top_search_terms(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (search_term TEXT, search_count BIGINT, avg_results NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      TRIM(LOWER(ae.metadata->>'query'))::TEXT AS search_term,
      COUNT(*)::BIGINT AS search_count,
      ROUND(AVG(CASE WHEN ae.metadata->>'results_count' IS NOT NULL
                     THEN (ae.metadata->>'results_count')::INT
                     ELSE NULL END)::NUMERIC, 1) AS avg_results
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'search_performed'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'query' IS NOT NULL
      AND TRIM(ae.metadata->>'query') <> ''
    GROUP BY TRIM(LOWER(ae.metadata->>'query'))
    ORDER BY search_count DESC
    LIMIT p_limit;
END $$;

-- 2. Conversion funnel (page_view → product_detail_open → selection_add)
CREATE OR REPLACE FUNCTION public.analytics_conversion_funnel(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  step_name TEXT,
  step_label TEXT,
  session_count BIGINT,
  percentage NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_page_views BIGINT;
  v_product_opens BIGINT;
  v_selections BIGINT;
BEGIN
  SELECT COUNT(DISTINCT ae.session_id) INTO v_page_views
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'page_view'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  SELECT COUNT(DISTINCT ae.session_id) INTO v_product_opens
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'product_detail_open'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  SELECT COUNT(DISTINCT ae.session_id) INTO v_selections
  FROM analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'selection_add'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  RETURN QUERY
    SELECT
      'page_view'::TEXT,
      'Visite'::TEXT,
      COALESCE(v_page_views, 0)::BIGINT,
      100::NUMERIC
    UNION ALL
    SELECT
      'product_detail_open'::TEXT,
      'Dettaglio prodotto'::TEXT,
      COALESCE(v_product_opens, 0)::BIGINT,
      CASE WHEN COALESCE(v_page_views, 0) = 0 THEN 0::NUMERIC
           ELSE ROUND(COALESCE(v_product_opens, 0)::NUMERIC / v_page_views::NUMERIC * 100, 1)
      END
    UNION ALL
    SELECT
      'selection_add'::TEXT,
      'Aggiunto alla selezione'::TEXT,
      COALESCE(v_selections, 0)::BIGINT,
      CASE WHEN COALESCE(v_page_views, 0) = 0 THEN 0::NUMERIC
           ELSE ROUND(COALESCE(v_selections, 0)::NUMERIC / v_page_views::NUMERIC * 100, 1)
      END;
END $$;

-- 3. Featured content performance
CREATE OR REPLACE FUNCTION public.analytics_featured_performance(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE (title TEXT, slot TEXT, click_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'title')::TEXT AS title,
      (ae.metadata->>'slot')::TEXT AS slot,
      COUNT(*)::BIGINT AS click_count
    FROM analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'featured_click'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'title' IS NOT NULL
    GROUP BY ae.metadata->>'title', ae.metadata->>'slot'
    ORDER BY click_count DESC
    LIMIT p_limit;
END $$;
