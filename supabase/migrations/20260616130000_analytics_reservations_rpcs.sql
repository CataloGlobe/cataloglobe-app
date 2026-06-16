-- Analytics RPC functions for the RESERVATIONS domain.
--
-- Security model: SECURITY INVOKER + STABLE, identical to the existing analytics_*
-- and analytics_orders_* RPCs. RLS on reservations enforces activity-granular
-- scoping via has_permission('reservations.read', activity_id); a caller without
-- that permission simply sees no rows. No SECURITY DEFINER, no custom
-- GRANT/REVOKE, no SET search_path (matches the sibling analytics RPCs).
--
-- Time basis: the period window [p_from, p_to] filters on created_at — i.e.
-- "reservations RECEIVED in the period", consistent with how orders use
-- submitted_at. This makes data visible in the backward-looking period selector
-- (Today/7d/30d/...). The future-looking "service load" view (by reservation_date)
-- is a separate enhancement and is intentionally NOT modeled here.
-- Hourly distribution buckets by reservation_time (a plain local TIME, no tz) —
-- the requested service time-of-day.
--
-- Status semantics: declined and cancelled are kept DISTINCT. "confirmed" counts
-- the honored set (confirmed + seated + completed), since seated/completed are
-- post-confirmation lifecycle states (added in 20260615140000, flow TBD).

-- 1. Reservations overview
CREATE OR REPLACE FUNCTION public.analytics_reservations_overview(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (
  reservations_count BIGINT,
  covers BIGINT,
  confirmed_count BIGINT,
  confirm_rate NUMERIC,
  declined_count BIGINT,
  cancelled_count BIGINT,
  online_count BIGINT,
  manual_count BIGINT
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    WITH scoped AS (
      SELECT r.status, r.source, r.party_size
      FROM public.reservations r
      WHERE r.tenant_id = p_tenant_id
        AND r.created_at >= p_from
        AND r.created_at <= p_to
        AND (p_activity_id IS NULL OR r.activity_id = p_activity_id)
    )
    SELECT
      COUNT(*)::BIGINT AS reservations_count,
      COALESCE(SUM(party_size), 0)::BIGINT AS covers,
      COUNT(*) FILTER (WHERE status IN ('confirmed', 'seated', 'completed'))::BIGINT AS confirmed_count,
      CASE WHEN COUNT(*) = 0 THEN 0::NUMERIC
           ELSE ROUND(
             COUNT(*) FILTER (WHERE status IN ('confirmed', 'seated', 'completed'))::NUMERIC
             / COUNT(*)::NUMERIC * 100, 1)
      END AS confirm_rate,
      COUNT(*) FILTER (WHERE status = 'declined')::BIGINT AS declined_count,
      COUNT(*) FILTER (WHERE status = 'cancelled')::BIGINT AS cancelled_count,
      COUNT(*) FILTER (WHERE source = 'online')::BIGINT AS online_count,
      COUNT(*) FILTER (WHERE source = 'manual')::BIGINT AS manual_count
    FROM scoped;
END $$;

-- 2. Reservations trend (daily): count + covers per day (by created_at).
CREATE OR REPLACE FUNCTION public.analytics_reservations_trend(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL,
  p_granularity TEXT DEFAULT 'day'
)
RETURNS TABLE (date TEXT, reservations_count BIGINT, covers BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      TO_CHAR(DATE_TRUNC(p_granularity, r.created_at), 'YYYY-MM-DD') AS date,
      COUNT(*)::BIGINT AS reservations_count,
      COALESCE(SUM(r.party_size), 0)::BIGINT AS covers
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.created_at >= p_from
      AND r.created_at <= p_to
      AND (p_activity_id IS NULL OR r.activity_id = p_activity_id)
    GROUP BY DATE_TRUNC(p_granularity, r.created_at)
    ORDER BY DATE_TRUNC(p_granularity, r.created_at);
END $$;

-- 3. Reservations hourly distribution: count per requested service hour.
-- reservation_time is a plain local TIME → EXTRACT(HOUR ...) directly (no tz).
CREATE OR REPLACE FUNCTION public.analytics_reservations_hourly(
  p_tenant_id UUID,
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_activity_id UUID DEFAULT NULL
)
RETURNS TABLE (hour INT, reservations_count BIGINT)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
AS $$
BEGIN
  RETURN QUERY
    SELECT
      EXTRACT(HOUR FROM r.reservation_time)::INT AS hour,
      COUNT(*)::BIGINT AS reservations_count
    FROM public.reservations r
    WHERE r.tenant_id = p_tenant_id
      AND r.created_at >= p_from
      AND r.created_at <= p_to
      AND (p_activity_id IS NULL OR r.activity_id = p_activity_id)
    GROUP BY EXTRACT(HOUR FROM r.reservation_time)
    ORDER BY 1;
END $$;
