-- Analytics RPC functions for the ORDERS domain (table ordering epic).
--
-- Security model: SECURITY INVOKER + STABLE, identical to the existing
-- analytics_* RPCs (20260414160000 / 170000 / 180000). No SECURITY DEFINER,
-- no custom GRANT/REVOKE, no manual tenant check: RLS on orders / order_items
-- / order_groups already enforces activity-granular scoping via
-- has_permission('orders.read', activity_id). A caller without orders.read on
-- an activity simply sees no rows (empty aggregate), never another tenant's data.
--
-- Revenue facts (verified on staging 2026-06-15):
--   * order_items.line_total = unit_price_snapshot * quantity, and
--     SUM(order_items.line_total) per order == orders.total_amount (no tip/discount).
--     => revenue can use orders.total_amount (overview/trend) or SUM(line_total)
--        (per-product). Both reconcile.
--   * Currency: EUR only today (single-currency assumption; revisit for multi-region).
--
-- Rectification handling (anti double-count): a rectification is a child order
-- (is_rectification = true, parent_order_id set) that supersedes its parent.
-- "Billable" orders = non-cancelled AND not superseded by a rectification child.
-- This avoids counting both parent and child. (0 rectifications in data today,
-- but the filter is future-proof.)
--
-- Time basis: orders are bucketed/filtered by submitted_at (placement time),
-- which is always populated (orders enter in the 'submitted' state).

-- 1. Orders overview: count, revenue, AOV, cancellation rate
CREATE OR REPLACE FUNCTION public.analytics_orders_overview(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  orders_count BIGINT,
  revenue NUMERIC,
  avg_order_value NUMERIC,
  cancellation_rate NUMERIC,
  cancelled_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    WITH scoped AS (
      SELECT o.id, o.status, o.total_amount, o.is_rectification
      FROM public.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.submitted_at >= p_from
        AND o.submitted_at <= p_to
        AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
        AND NOT EXISTS (
          SELECT 1 FROM public.orders r
          WHERE r.parent_order_id = o.id AND r.is_rectification = true
        )
    ),
    billable AS (
      SELECT * FROM scoped WHERE status <> 'cancelled'
    )
    SELECT
      (SELECT COUNT(*) FROM billable)::BIGINT AS orders_count,
      COALESCE((SELECT SUM(total_amount) FROM billable), 0)::NUMERIC AS revenue,
      COALESCE((SELECT ROUND(AVG(total_amount), 2) FROM billable), 0)::NUMERIC AS avg_order_value,
      CASE
        WHEN (SELECT COUNT(*) FROM scoped) = 0 THEN 0::NUMERIC
        ELSE ROUND(
          (SELECT COUNT(*) FROM scoped WHERE status = 'cancelled')::NUMERIC
          / (SELECT COUNT(*) FROM scoped)::NUMERIC * 100, 1)
      END AS cancellation_rate,
      (SELECT COUNT(*) FROM scoped WHERE status = 'cancelled')::BIGINT AS cancelled_count;
END $$;

-- 2a. Orders trend (daily): orders + revenue per day
CREATE OR REPLACE FUNCTION public.analytics_orders_trend(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (date TEXT, orders_count BIGINT, revenue NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      TO_CHAR(DATE_TRUNC(p_granularity, o.submitted_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::BIGINT AS orders_count,
      COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.status <> 'cancelled'
      AND o.submitted_at >= p_from
      AND o.submitted_at <= p_to
      AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.orders r
        WHERE r.parent_order_id = o.id AND r.is_rectification = true
      )
    GROUP BY DATE_TRUNC(p_granularity, o.submitted_at)
    ORDER BY DATE_TRUNC(p_granularity, o.submitted_at);
END $$;

-- 2b. Orders hourly distribution: orders + revenue per hour-of-day (local time).
-- Hour computed in Europe/Rome to match the operative-day convention used
-- elsewhere in the ordering epic (get_operative_day_start).
CREATE OR REPLACE FUNCTION public.analytics_orders_hourly(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (hour INT, orders_count BIGINT, revenue NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM o.submitted_at AT TIME ZONE 'Europe/Rome')::INT AS hour,
      COUNT(*)::BIGINT AS orders_count,
      COALESCE(SUM(o.total_amount), 0)::NUMERIC AS revenue
    FROM public.orders o
    WHERE o.tenant_id = p_tenant_id
      AND o.status <> 'cancelled'
      AND o.submitted_at >= p_from
      AND o.submitted_at <= p_to
      AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
      AND NOT EXISTS (
        SELECT 1 FROM public.orders r
        WHERE r.parent_order_id = o.id AND r.is_rectification = true
      )
    GROUP BY EXTRACT(HOUR FROM o.submitted_at AT TIME ZONE 'Europe/Rome')
    ORDER BY 1;
END $$;

-- 3. Top ordered products (from order_items snapshot — survives product deletion).
-- p_order_by: 'quantity' (default) or 'revenue' to drive the two UI cards.
CREATE OR REPLACE FUNCTION public.analytics_top_ordered_products(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_order_by TEXT DEFAULT 'quantity'
)
RETURNS TABLE (product_name TEXT, quantity BIGINT, revenue NUMERIC)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      oi.product_name_snapshot::TEXT AS product_name,
      SUM(oi.quantity)::BIGINT AS quantity,
      COALESCE(SUM(oi.line_total), 0)::NUMERIC AS revenue
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.tenant_id = p_tenant_id
      AND o.status <> 'cancelled'
      AND o.submitted_at >= p_from
      AND o.submitted_at <= p_to
      AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
      AND oi.product_name_snapshot IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.orders r
        WHERE r.parent_order_id = o.id AND r.is_rectification = true
      )
    GROUP BY oi.product_name_snapshot
    ORDER BY
      CASE WHEN p_order_by = 'revenue' THEN COALESCE(SUM(oi.line_total), 0)
           ELSE SUM(oi.quantity)::NUMERIC END DESC
    LIMIT p_limit;
END $$;

-- 4. Operational latency on delivered orders: prep / delivery / total.
-- prep    = ready_at - submitted_at      (only rows with ready_at NOT NULL)
-- delivery = delivered_at - ready_at      (only rows with ready_at NOT NULL)
-- total    = delivered_at - submitted_at  (all delivered rows)
-- skipped_ready_count: delivered orders with ready_at NULL (deliver-from-acknowledged
-- skip-ready workflow). Exposed so the FE can flag that prep/delivery averages are
-- computed on a subset and the totals are not silently skewed.
-- All durations returned in seconds. Both mean (avg_*) and median (median_*) provided.
CREATE OR REPLACE FUNCTION public.analytics_orders_latency(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  delivered_count BIGINT,
  skipped_ready_count BIGINT,
  avg_prep_seconds NUMERIC,
  median_prep_seconds NUMERIC,
  avg_delivery_seconds NUMERIC,
  median_delivery_seconds NUMERIC,
  avg_total_seconds NUMERIC,
  median_total_seconds NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    WITH d AS (
      SELECT
        o.submitted_at, o.ready_at, o.delivered_at,
        CASE WHEN o.ready_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (o.ready_at - o.submitted_at)) END AS prep_s,
        CASE WHEN o.ready_at IS NOT NULL AND o.delivered_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (o.delivered_at - o.ready_at)) END AS delivery_s,
        CASE WHEN o.delivered_at IS NOT NULL
             THEN EXTRACT(EPOCH FROM (o.delivered_at - o.submitted_at)) END AS total_s
      FROM public.orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.status = 'delivered'
        AND o.submitted_at >= p_from
        AND o.submitted_at <= p_to
        AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
    )
    SELECT
      COUNT(*)::BIGINT AS delivered_count,
      COUNT(*) FILTER (WHERE ready_at IS NULL)::BIGINT AS skipped_ready_count,
      COALESCE(ROUND(AVG(prep_s)::NUMERIC, 0), 0) AS avg_prep_seconds,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY prep_s)::NUMERIC, 0), 0) AS median_prep_seconds,
      COALESCE(ROUND(AVG(delivery_s)::NUMERIC, 0), 0) AS avg_delivery_seconds,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY delivery_s)::NUMERIC, 0), 0) AS median_delivery_seconds,
      COALESCE(ROUND(AVG(total_s)::NUMERIC, 0), 0) AS avg_total_seconds,
      COALESCE(ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY total_s)::NUMERIC, 0), 0) AS median_total_seconds
    FROM d;
END $$;

-- 5. Selection -> order conversion (AGGREGATE proxy, NOT a per-session funnel stage).
-- No session link exists between analytics_events and orders, so this is the ratio
-- of (billable orders placed) over (distinct sessions that added to selection) in the
-- same scope/period. Both sources are read under the caller's RLS.
CREATE OR REPLACE FUNCTION public.analytics_orders_conversion(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  selection_sessions BIGINT,
  orders_count BIGINT,
  conversion_rate NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
DECLARE
  v_sessions BIGINT;
  v_orders BIGINT;
BEGIN
  SELECT COUNT(DISTINCT ae.session_id) INTO v_sessions
  FROM public.analytics_events ae
  WHERE ae.tenant_id = p_tenant_id
    AND ae.event_type = 'selection_add'
    AND ae.created_at >= p_from
    AND ae.created_at <= p_to
    AND (p_activity_id IS NULL OR ae.activity_id = p_activity_id)
    AND ae.session_id IS NOT NULL;

  SELECT COUNT(*) INTO v_orders
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.status <> 'cancelled'
    AND o.submitted_at >= p_from
    AND o.submitted_at <= p_to
    AND (p_activity_id IS NULL OR o.activity_id = p_activity_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.orders r
      WHERE r.parent_order_id = o.id AND r.is_rectification = true
    );

  RETURN QUERY
    SELECT
      COALESCE(v_sessions, 0)::BIGINT,
      COALESCE(v_orders, 0)::BIGINT,
      CASE WHEN COALESCE(v_sessions, 0) = 0 THEN 0::NUMERIC
           ELSE ROUND(COALESCE(v_orders, 0)::NUMERIC / v_sessions::NUMERIC * 100, 1)
      END;
END $$;
