-- =============================================================================
-- Hardening: SET search_path TO '' su funzioni pubbliche
-- =============================================================================
-- Risolve 27 warning Supabase advisor "function_search_path_mutable".
-- Previene search_path injection: forza qualifica esplicita degli oggetti.
--
-- Esclusa da questo PR: enforce_seat_limit (è anche in audit SECURITY DEFINER,
-- verrà fixata in PR2 con review della clausola SECURITY).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Blocco A: 14 funzioni che già qualificano oggetti o sono pure.
-- Solo ALTER FUNCTION ... SET search_path TO ''.
-- -----------------------------------------------------------------------------

ALTER FUNCTION public.handle_new_user() SET search_path TO '';
ALTER FUNCTION public.is_reserved_slug(text) SET search_path TO '';
ALTER FUNCTION public.is_schedule_active(s public.schedules) SET search_path TO '';
ALTER FUNCTION public.is_schedule_active_now(smallint[], time without time zone, time without time zone, text) SET search_path TO '';
ALTER FUNCTION public.prevent_delete_system_styles() SET search_path TO '';
ALTER FUNCTION public.purge_user_data(uuid) SET search_path TO '';
ALTER FUNCTION public.set_updated_at() SET search_path TO '';
ALTER FUNCTION public.simple_slug(text) SET search_path TO '';
ALTER FUNCTION public.trg_check_product_group_depth() SET search_path TO '';
ALTER FUNCTION public.trg_check_product_group_items_tenant() SET search_path TO '';
ALTER FUNCTION public.trg_check_product_variant() SET search_path TO '';
ALTER FUNCTION public.trg_check_variant_assignment() SET search_path TO '';
ALTER FUNCTION public.trg_product_groups_updated_at() SET search_path TO '';
ALTER FUNCTION public.update_updated_at_column() SET search_path TO '';

-- -----------------------------------------------------------------------------
-- Blocco B: 13 funzioni che richiedono qualifiche nel body + SET search_path.
-- CREATE OR REPLACE FUNCTION con body riscritto.
-- Le 12 analytics_* ricevono qualifica `public.analytics_events`.
-- validate_ccp_variant_parent riceve qualifica `public.products`.
-- Built-in pg_catalog (count, coalesce, round, ecc.) non richiedono qualifica.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.analytics_conversion_funnel(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(step_name text, step_label text, session_count bigint, percentage numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_page_views BIGINT;
  v_product_opens BIGINT;
  v_selections BIGINT;
BEGIN
  SELECT COUNT(DISTINCT ae.session_id) INTO v_page_views
  FROM public.analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'page_view'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  SELECT COUNT(DISTINCT ae.session_id) INTO v_product_opens
  FROM public.analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'product_detail_open'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  SELECT COUNT(DISTINCT ae.session_id) INTO v_selections
  FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_device_distribution(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(device_type text, device_count bigint, percentage numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    WITH counts AS (
      SELECT ae.device_type, COUNT(DISTINCT ae.session_id)::BIGINT AS cnt
      FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_featured_performance(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(title text, slot text, click_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'title')::TEXT AS title,
      (ae.metadata->>'slot')::TEXT AS slot,
      COUNT(*)::BIGINT AS click_count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'featured_click'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'title' IS NOT NULL
    GROUP BY ae.metadata->>'title', ae.metadata->>'slot'
    ORDER BY click_count DESC
    LIMIT p_limit;
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_hourly_distribution(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(hour integer, view_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM ae.created_at)::INT AS hour,
      COUNT(*)::BIGINT AS view_count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'page_view'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    GROUP BY EXTRACT(HOUR FROM ae.created_at)
    ORDER BY hour;
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_overview_stats(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(total_views bigint, unique_sessions bigint, avg_events_per_session numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    WITH base AS (
      SELECT ae.session_id, ae.event_type
      FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_page_views_trend(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_granularity text DEFAULT 'day'::text)
 RETURNS TABLE(date text, count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      TO_CHAR(DATE_TRUNC('day', ae.created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::BIGINT AS count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'page_view'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    GROUP BY DATE_TRUNC('day', ae.created_at)
    ORDER BY DATE_TRUNC('day', ae.created_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_review_metrics(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_total BIGINT;
  v_avg_rating NUMERIC;
  v_google_redirects BIGINT;
  v_distribution JSON;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'review_submitted'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id);

  SELECT ROUND(AVG((ae.metadata->>'rating')::INT), 1) INTO v_avg_rating
  FROM public.analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'review_submitted'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.metadata->>'rating' IS NOT NULL;

  SELECT COUNT(*) INTO v_google_redirects
  FROM public.analytics_events ae
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
    FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_search_rate(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(search_sessions bigint, total_sessions bigint, rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    WITH base AS (
      SELECT ae.session_id, ae.event_type
      FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_social_clicks(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(social_type text, click_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'social_type')::TEXT AS social_type,
      COUNT(*)::BIGINT AS click_count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'social_click'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'social_type' IS NOT NULL
    GROUP BY ae.metadata->>'social_type'
    ORDER BY click_count DESC;
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_top_search_terms(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(search_term text, search_count bigint, avg_results numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      TRIM(LOWER(ae.metadata->>'query'))::TEXT AS search_term,
      COUNT(*)::BIGINT AS search_count,
      ROUND(AVG(CASE WHEN ae.metadata->>'results_count' IS NOT NULL
                     THEN (ae.metadata->>'results_count')::INT
                     ELSE NULL END)::NUMERIC, 1) AS avg_results
    FROM public.analytics_events ae
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
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_top_selected_products(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_name text, selection_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'product_name')::TEXT AS product_name,
      COUNT(*)::BIGINT AS selection_count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'selection_add'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'product_name' IS NOT NULL
    GROUP BY ae.metadata->>'product_name'
    ORDER BY selection_count DESC
    LIMIT p_limit;
END $function$;

CREATE OR REPLACE FUNCTION public.analytics_top_viewed_products(p_tenant_id uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(product_name text, view_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
  RETURN QUERY
    SELECT
      (ae.metadata->>'product_name')::TEXT AS product_name,
      COUNT(*)::BIGINT AS view_count
    FROM public.analytics_events ae
    WHERE ae.tenant_id = p_tenant_id
      AND ae.event_type = 'product_detail_open'
      AND ae.created_at >= p_from
      AND ae.created_at <= p_to
      AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
      AND ae.metadata->>'product_name' IS NOT NULL
    GROUP BY ae.metadata->>'product_name'
    ORDER BY view_count DESC
    LIMIT p_limit;
END $function$;

CREATE OR REPLACE FUNCTION public.validate_ccp_variant_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.variant_product_id IS NOT NULL THEN
    IF NEW.variant_product_id = NEW.product_id THEN
      RAISE EXCEPTION 'variant_product_id cannot be equal to product_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products
      WHERE id = NEW.variant_product_id
        AND parent_product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'variant_product_id % is not a variant of product_id %',
        NEW.variant_product_id, NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
