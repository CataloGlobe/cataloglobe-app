Initialising login role...
Dumping schemas from remote database...



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."schedule_priority_level" AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);


ALTER TYPE "public"."schedule_priority_level" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Single atomic UPDATE: validates status and expiry, accepts in one step.
  -- No user_id filter in WHERE — required for email-only invites where the
  -- row was created with user_id = NULL.
  -- user_id is set here so get_my_tenant_ids() and all RLS policies that
  -- depend on tm.user_id = auth.uid() work immediately after acceptance.
  UPDATE public.tenant_memberships
  SET
    status             = 'active',
    user_id            = auth.uid(),
    invited_email      = NULL,
    invite_token       = NULL,
    invite_accepted_at = now()
  WHERE invite_token      = p_token
    AND status            = 'pending'
    AND invite_expires_at > now()
  RETURNING tenant_id INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'invalid or already used invite token';
  END IF;

  RETURN v_tenant_id;
END;
$$;


ALTER FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE public.tenant_memberships
  SET status = 'active'
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'pending';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count = 0 THEN
    RAISE EXCEPTION 'invite not found';
  END IF;
END;
$$;


ALTER FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_device_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("device_type" "text", "device_count" bigint, "percentage" numeric)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_device_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_hourly_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("hour" integer, "view_count" bigint)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_hourly_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_overview_stats"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("total_views" bigint, "unique_sessions" bigint, "avg_events_per_session" numeric)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_overview_stats"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_page_views_trend"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid", "p_granularity" "text" DEFAULT 'day'::"text") RETURNS TABLE("date" "text", "count" bigint)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_page_views_trend"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_granularity" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_review_metrics"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS json
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_review_metrics"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_search_rate"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("search_sessions" bigint, "total_sessions" bigint, "rate" numeric)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_search_rate"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_social_clicks"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid") RETURNS TABLE("social_type" "text", "click_count" bigint)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_social_clicks"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_top_selected_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("product_name" "text", "selection_count" bigint)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_top_selected_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."analytics_top_viewed_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid" DEFAULT NULL::"uuid", "p_limit" integer DEFAULT 10) RETURNS TABLE("product_name" "text", "view_count" bigint)
    LANGUAGE "plpgsql" STABLE
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


ALTER FUNCTION "public"."analytics_top_viewed_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_updated_id uuid;
BEGIN
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid role: must be admin or member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.tenant_memberships
  SET role = p_role
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active'
    AND role      != 'owner'
  RETURNING id INTO v_updated_id;

  RETURN v_updated_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = NULL
  WHERE  id = p_user_id;

  -- No ROW_COUNT check: idempotent. A NULL → NULL update or a missing row
  -- are both safe outcomes — the column is clear either way.

END;
$$;


ALTER FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_declined_id uuid;
BEGIN
  UPDATE public.tenant_memberships
  SET
    status       = 'declined',
    invite_token = NULL
  WHERE invite_token = p_token
    AND status       = 'pending'
  RETURNING id INTO v_declined_id;

  RETURN v_declined_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_invite"("p_membership_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id  uuid;
  v_deleted_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired');

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  DELETE FROM public.tenant_memberships
  WHERE id     = p_membership_id
    AND status IN ('declined', 'revoked', 'expired')
  RETURNING id INTO v_deleted_id;

  RETURN v_deleted_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."delete_invite"("p_membership_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_seat_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    current_count INTEGER;
    max_seats     INTEGER;
BEGIN
    SELECT COUNT(*) INTO current_count
    FROM activities
    WHERE tenant_id = NEW.tenant_id;

    SELECT paid_seats INTO max_seats
    FROM tenants
    WHERE id = NEW.tenant_id;

    IF max_seats IS NULL THEN
        -- Tenant not found — let the FK constraint handle it
        RETURN NEW;
    END IF;

    IF current_count >= max_seats THEN
        RAISE EXCEPTION 'Limite sedi raggiunto: % di % sedi utilizzate',
            current_count, max_seats
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."enforce_seat_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller_id     uuid;
  v_active_ids    uuid[];
  v_action_ids    uuid[];
  v_elem          jsonb;
  v_tenant_id     uuid;
  v_action_type   text;
  v_new_owner_id  uuid;
  v_uncovered_id  uuid;
  v_rows          integer;
BEGIN

  -- -------------------------------------------------------------------------
  -- Guard: caller must be authenticated
  -- -------------------------------------------------------------------------
  v_caller_id := auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated: caller is not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- -------------------------------------------------------------------------
  -- Load active tenants: owned by caller, not locked, not soft-deleted.
  -- -------------------------------------------------------------------------
  SELECT ARRAY(
    SELECT id
    FROM   public.tenants
    WHERE  owner_user_id = v_caller_id
      AND  locked_at     IS NULL
      AND  deleted_at    IS NULL
  ) INTO v_active_ids;

  -- Case A: caller owns no active tenants — idempotent early return.
  IF array_length(v_active_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- Case B: active tenants exist — p_actions must be a non-empty array.
  IF p_actions IS NULL
     OR jsonb_typeof(p_actions) != 'array'
     OR jsonb_array_length(p_actions) = 0
  THEN
    RAISE EXCEPTION 'incomplete_actions: p_actions must cover all active owned tenants but was empty or missing'
      USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------------------
  -- Validate each element in p_actions.
  -- -------------------------------------------------------------------------
  v_action_ids := ARRAY[]::uuid[];

  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    IF (v_elem->>'tenant_id') IS NULL THEN
      RAISE EXCEPTION 'incomplete_actions: every action must include tenant_id'
        USING ERRCODE = 'P0001';
    END IF;

    BEGIN
      v_tenant_id := (v_elem->>'tenant_id')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
        USING ERRCODE = '22000';
    END;

    IF v_tenant_id = ANY(v_action_ids) THEN
      RAISE EXCEPTION 'duplicate_tenant_action: tenant_id % appears more than once in p_actions', v_tenant_id
        USING ERRCODE = 'P0001';
    END IF;

    v_action_type := v_elem->>'action';

    IF v_action_type NOT IN ('transfer', 'lock') THEN
      RAISE EXCEPTION 'invalid_action: action must be "transfer" or "lock", got "%"', v_action_type
        USING ERRCODE = '22000';
    END IF;

    IF v_action_type = 'transfer' AND (v_elem->>'new_owner_user_id') IS NULL THEN
      RAISE EXCEPTION 'missing_new_owner: action "transfer" for tenant % requires new_owner_user_id', v_tenant_id
        USING ERRCODE = '22000';
    END IF;

    IF NOT (v_tenant_id = ANY(v_active_ids)) THEN
      RAISE EXCEPTION 'not_owner_of_tenant: tenant % is not an active owned tenant of this user', v_tenant_id
        USING ERRCODE = '42501';
    END IF;

    v_action_ids := array_append(v_action_ids, v_tenant_id);
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Coverage check: every active tenant must appear in p_actions.
  -- -------------------------------------------------------------------------
  SELECT t_id
  INTO   v_uncovered_id
  FROM   unnest(v_active_ids) AS t_id
  WHERE  NOT (t_id = ANY(v_action_ids))
  LIMIT  1;

  IF FOUND THEN
    RAISE EXCEPTION 'incomplete_actions: active tenant % is not covered by p_actions', v_uncovered_id
      USING ERRCODE = 'P0001';
  END IF;

  -- -------------------------------------------------------------------------
  -- Step 1: execute all transfers (before locks).
  -- transfer_ownership() inserts its own ownership_transferred audit event.
  -- -------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    IF v_elem->>'action' = 'transfer' THEN
      BEGIN
        v_tenant_id := (v_elem->>'tenant_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
          USING ERRCODE = '22000';
      END;

      BEGIN
        v_new_owner_id := (v_elem->>'new_owner_user_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_new_owner: invalid UUID for new_owner_user_id'
          USING ERRCODE = '22000';
      END;

      PERFORM public.transfer_ownership(v_tenant_id, v_new_owner_id);
    END IF;
  END LOOP;

  -- -------------------------------------------------------------------------
  -- Step 2: lock remaining tenants + audit.
  -- -------------------------------------------------------------------------
  FOR v_elem IN SELECT * FROM jsonb_array_elements(p_actions)
  LOOP
    IF v_elem->>'action' = 'lock' THEN
      BEGIN
        v_tenant_id := (v_elem->>'tenant_id')::uuid;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'invalid_tenant_id: invalid UUID for tenant_id'
          USING ERRCODE = '22000';
      END;

      UPDATE public.tenants
      SET    locked_at = now()
      WHERE  id            = v_tenant_id
        AND  owner_user_id = v_caller_id
        AND  locked_at     IS NULL;

      GET DIAGNOSTICS v_rows = ROW_COUNT;

      -- Only audit when the lock actually applied (not a no-op retry).
      IF v_rows > 0 THEN
        INSERT INTO public.v2_audit_events (event_type, actor_user_id, tenant_id, payload)
        VALUES ('tenant_locked', v_caller_id, v_tenant_id, jsonb_build_object());
      END IF;

    END IF;
  END LOOP;

END;
$$;


ALTER FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."expire_old_invites"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
    v_count integer;
BEGIN
    UPDATE public.tenant_memberships
    SET status = 'expired'
    WHERE status = 'pending'
      AND invite_expires_at IS NOT NULL
      AND invite_expires_at < now();

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;


ALTER FUNCTION "public"."expire_old_invites"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") RETURNS TABLE("tenant_id" "uuid", "tenant_name" "text", "role" "text", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN QUERY
    SELECT t.id, t.name, tm.role, tm.status
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.invite_token = p_token;
END;
$$;


ALTER FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_deleted_tenants"() RETURNS TABLE("id" "uuid", "name" "text", "vertical_type" "text", "created_at" timestamp with time zone, "deleted_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT
        id,
        name,
        vertical_type,
        created_at,
        deleted_at
    FROM public.tenants
    WHERE owner_user_id = auth.uid()
      AND deleted_at IS NOT NULL
    ORDER BY deleted_at DESC;
$$;


ALTER FUNCTION "public"."get_my_deleted_tenants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_my_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  -- Branch A: caller is the tenant owner
  SELECT t.id
  FROM public.tenants t
  WHERE t.owner_user_id = auth.uid()
    AND t.deleted_at IS NULL

  UNION

  -- Branch B: caller has an active membership (by user_id or pending invite by email)
  SELECT tm.tenant_id
  FROM public.tenant_memberships tm
  JOIN public.tenants t ON t.id = tm.tenant_id
  WHERE (tm.user_id = auth.uid() OR tm.invited_email = auth.email())
    AND tm.status    = 'active'
    AND t.deleted_at IS NULL
$$;


ALTER FUNCTION "public"."get_my_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_catalog record;
  v_style record;

  v_active_layout record;
  v_active_schedule record;

  v_payload jsonb;
BEGIN
  SELECT *
  INTO v_catalog
  FROM public.catalogs c
  WHERE c.id = p_catalog_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'CATALOG_NOT_FOUND');
  END IF;

  -- 1) Pick best active layout for this catalog
  -- FIX: priority ASC (valore più basso = precedenza più alta, coerente con il resolver TS)
  SELECT sl.*
  INTO v_active_layout
  FROM public.schedule_layout sl
  JOIN public.schedules s ON s.id = sl.schedule_id
  WHERE sl.tenant_id = v_catalog.tenant_id
    AND s.tenant_id = v_catalog.tenant_id
    AND public.is_schedule_active(s)
    AND (sl.catalog_id = p_catalog_id OR sl.catalog_id IS NULL)
  ORDER BY
    (sl.catalog_id = p_catalog_id) DESC,
    s.priority ASC,
    s.created_at ASC,
    sl.created_at ASC
  LIMIT 1;

  -- 2) Load schedule row for debug + potential future logic
  IF v_active_layout IS NOT NULL THEN
    SELECT s.*
    INTO v_active_schedule
    FROM public.schedules s
    WHERE s.id = v_active_layout.schedule_id;
  ELSE
    v_active_schedule := NULL;
  END IF;

  -- 3) Load style (if we have layout)
  IF v_active_layout IS NOT NULL THEN
    SELECT st.*
    INTO v_style
    FROM public.styles st
    WHERE st.id = v_active_layout.style_id;
  ELSE
    v_style := NULL;
  END IF;

  -- 4) Build payload with options included per-product
  v_payload :=
    jsonb_build_object(
      'ok', true,
      'catalog', to_jsonb(v_catalog),

      -- Debug helpers (safe to keep; frontend can ignore)
      'active_schedule', CASE WHEN v_active_schedule IS NULL THEN NULL ELSE to_jsonb(v_active_schedule) END,
      'active_layout', CASE WHEN v_active_layout IS NULL THEN NULL ELSE to_jsonb(v_active_layout) END,

      'style', CASE WHEN v_style IS NULL THEN NULL ELSE to_jsonb(v_style) END,

      'featured_contents', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'featured', to_jsonb(fc),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link', to_jsonb(fcp),
                      'product', to_jsonb(p),
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id', og.id,
                                'name', og.name,
                                'group_kind', og.group_kind,
                                'pricing_mode', og.pricing_mode,
                                'is_required', og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id', ov.id,
                                      'name', ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.product_option_groups og
                        WHERE og.product_id = p.id
                      )
                    )
                    ORDER BY COALESCE(fcp.sort_order, 0), fcp.created_at
                  )
                  FROM public.featured_content_products fcp
                  JOIN public.products p ON p.id = fcp.product_id
                  WHERE fcp.tenant_id = v_catalog.tenant_id
                    AND fcp.featured_content_id = fc.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY fc.created_at
          )
          FROM public.featured_contents fc
          WHERE fc.tenant_id = v_catalog.tenant_id
        ),
        '[]'::jsonb
      ),

      'categories', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'category', to_jsonb(cat),
              'products', COALESCE(
                (
                  SELECT jsonb_agg(
                    jsonb_build_object(
                      'link', to_jsonb(ccp),
                      'product', to_jsonb(p),
                      'options', (
                        SELECT COALESCE(
                          jsonb_agg(
                            jsonb_build_object(
                              'group', jsonb_build_object(
                                'id', og.id,
                                'name', og.name,
                                'group_kind', og.group_kind,
                                'pricing_mode', og.pricing_mode,
                                'is_required', og.is_required,
                                'max_selectable', og.max_selectable
                              ),
                              'values', COALESCE(
                                (
                                  SELECT jsonb_agg(
                                    jsonb_build_object(
                                      'id', ov.id,
                                      'name', ov.name,
                                      'absolute_price', ov.absolute_price,
                                      'price_modifier', ov.price_modifier
                                    )
                                    ORDER BY ov.created_at
                                  )
                                  FROM public.product_option_values ov
                                  WHERE ov.option_group_id = og.id
                                ),
                                '[]'::jsonb
                              )
                            )
                            ORDER BY og.created_at
                          ),
                          '[]'::jsonb
                        )
                        FROM public.product_option_groups og
                        WHERE og.product_id = p.id
                      ),
                      'pricing',
                        (
                          WITH o AS (
                            SELECT spo.override_price, spo.show_original_price
                            FROM public.schedule_price_overrides spo
                            JOIN public.schedules s ON s.id = spo.schedule_id
                            WHERE spo.tenant_id = v_catalog.tenant_id
                              AND spo.product_id = p.id
                              AND s.enabled = true
                            ORDER BY spo.created_at DESC
                            LIMIT 1
                          ),
                          fp AS (
                            SELECT MIN(ov.absolute_price) AS min_price
                            FROM public.product_option_groups og
                            JOIN public.product_option_values ov ON ov.option_group_id = og.id
                            WHERE og.product_id = p.id
                              AND og.group_kind = 'PRIMARY_PRICE'
                              AND og.pricing_mode = 'ABSOLUTE'
                              AND ov.absolute_price IS NOT NULL
                          )
                          SELECT jsonb_build_object(
                            'base_price', p.base_price,
                            'effective_price', COALESCE((SELECT override_price FROM o), p.base_price),
                            'has_override', ((SELECT override_price FROM o) IS NOT NULL),
                            'show_original_price', COALESCE((SELECT show_original_price FROM o), false),
                            'original_price',
                              CASE
                                WHEN (SELECT override_price FROM o) IS NOT NULL
                                  AND COALESCE((SELECT show_original_price FROM o), false)
                                THEN p.base_price
                                ELSE NULL
                              END,
                            'from_price', (SELECT min_price FROM fp)
                          )
                        )
                    )
                    ORDER BY COALESCE(ccp.sort_order, 0), ccp.created_at
                  )
                  FROM public.catalog_category_products ccp
                  JOIN public.products p ON p.id = ccp.product_id
                  WHERE ccp.catalog_id = p_catalog_id
                    AND ccp.category_id = cat.id
                ),
                '[]'::jsonb
              )
            )
            ORDER BY COALESCE(cat.sort_order, 0), cat.created_at
          )
          FROM public.catalog_categories cat
          WHERE cat.catalog_id = p_catalog_id
            AND cat.parent_category_id IS NULL
        ),
        '[]'::jsonb
      )
    );

  RETURN v_payload;
END;
$$;


ALTER FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT id FROM public.tenants WHERE deleted_at IS NULL
$$;


ALTER FUNCTION "public"."get_public_tenant_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_schedule_featured_contents"("p_schedule_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slot',      sfc.slot,
        'sort_order', sfc.sort_order,
        'featured_content', jsonb_build_object(
          'id',                 fc.id,
          'internal_name',      fc.internal_name,
          'title',              fc.title,
          'subtitle',           fc.subtitle,
          'description',        fc.description,
          'media_id',           fc.media_id,
          'cta_text',           fc.cta_text,
          'cta_url',            fc.cta_url,
          'status',             fc.status,
          'layout_style',       fc.layout_style,
          'pricing_mode',       fc.pricing_mode,
          'bundle_price',       fc.bundle_price,
          'show_original_total', fc.show_original_total,
          'created_at',         fc.created_at,
          'updated_at',         fc.updated_at,
          'products', (
            SELECT COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'sort_order', fcp.sort_order,
                  'note',       fcp.note,
                  'product', jsonb_build_object(
                    'id',          p.id,
                    'name',        p.name,
                    'description', p.description,
                    'base_price',  p.base_price,
                    'image_url',   p.image_url,
                    'option_groups', (
                      SELECT COALESCE(
                        jsonb_agg(
                          jsonb_build_object(
                            'group_kind', og.group_kind,
                            'values', (
                              SELECT COALESCE(
                                jsonb_agg(
                                  jsonb_build_object(
                                    'name',           ov.name,
                                    'absolute_price', ov.absolute_price
                                  )
                                ),
                                '[]'::jsonb
                              )
                              FROM public.product_option_values ov
                              WHERE ov.option_group_id = og.id
                            )
                          )
                        ),
                        '[]'::jsonb
                      )
                      FROM public.product_option_groups og
                      WHERE og.product_id = p.id
                    )
                  )
                )
                ORDER BY COALESCE(fcp.sort_order, 0), fcp.id
              ),
              '[]'::jsonb
            )
            FROM public.featured_content_products fcp
            JOIN public.products p ON p.id = fcp.product_id
            WHERE fcp.featured_content_id = fc.id
          )
        )
      )
      ORDER BY sfc.sort_order
    ),
    '[]'::jsonb
  )
  FROM public.schedule_featured_contents sfc
  JOIN public.featured_contents fc   ON fc.id  = sfc.featured_content_id
  JOIN public.schedules          s   ON s.id   = sfc.schedule_id
  JOIN public.tenants            t   ON t.id   = s.tenant_id
  WHERE sfc.schedule_id = p_schedule_id
    AND fc.status       = 'published'
    AND t.deleted_at    IS NULL
$$;


ALTER FUNCTION "public"."get_schedule_featured_contents"("p_schedule_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'logo_url', t.logo_url,
      'name', t.name,
      'subscription_status', t.subscription_status
    )
    FROM public.tenants t
    WHERE t.id = p_tenant_id AND t.deleted_at IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_id_by_email"("p_email" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE lower(email) = lower(p_email)
  LIMIT 1;

  RETURN v_user_id;
END;
$$;


ALTER FUNCTION "public"."get_user_id_by_email"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenants"() RETURNS TABLE("id" "uuid", "name" "text", "vertical_type" "text", "business_subtype" "text", "created_at" timestamp with time zone, "owner_user_id" "uuid", "user_role" "text", "logo_url" "text", "plan" "text", "subscription_status" "text", "trial_until" timestamp with time zone, "stripe_customer_id" "text", "stripe_subscription_id" "text", "paid_seats" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
    SELECT
        t.id,
        t.name,
        t.vertical_type,
        t.business_subtype,
        t.created_at,
        t.owner_user_id,
        CASE
            WHEN t.owner_user_id = auth.uid() THEN 'owner'
            WHEN tm.role IS NOT NULL           THEN tm.role
            ELSE NULL
        END AS user_role,
        t.logo_url,
        t.plan,
        t.subscription_status,
        t.trial_until,
        t.stripe_customer_id,
        t.stripe_subscription_id,
        t.paid_seats
    FROM public.tenants t
    LEFT JOIN public.tenant_memberships tm
        ON  tm.tenant_id = t.id
        AND tm.user_id   = auth.uid()
        AND tm.status     = 'active'
    WHERE t.deleted_at IS NULL
      AND (
          t.owner_user_id = auth.uid()
          OR tm.user_id IS NOT NULL
      )
$$;


ALTER FUNCTION "public"."get_user_tenants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_tenant_membership"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO public.tenant_memberships (
    tenant_id,
    user_id,
    role,
    status
  ) VALUES (
    NEW.id,
    NEW.owner_user_id,
    'owner',
    'active'
  )
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_tenant_membership"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_tenant_system_group"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_style_id   uuid;
  v_version_id uuid;
BEGIN
  -- Existing behavior: create system activity group
  INSERT INTO public.activity_groups (tenant_id, name, is_system)
  VALUES (NEW.id, 'Tutte le sedi', TRUE)
  ON CONFLICT (tenant_id, name) DO NOTHING;

  -- Ensure default system style exists for new tenant
  SELECT s.id
  INTO v_style_id
  FROM public.styles s
  WHERE s.tenant_id = NEW.id
    AND s.is_system = TRUE
  ORDER BY s.created_at ASC, s.id ASC
  LIMIT 1;

  IF v_style_id IS NULL THEN
    INSERT INTO public.styles (
      tenant_id,
      name,
      is_system,
      is_active,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      'Default',
      TRUE,
      TRUE,
      now(),
      now()
    )
    RETURNING id INTO v_style_id;

    INSERT INTO public.style_versions (
      tenant_id,
      style_id,
      version,
      config,
      created_at
    )
    VALUES (
      NEW.id,
      v_style_id,
      1,
      jsonb_build_object(
        'colors', jsonb_build_object(
          'pageBackground',   '#FFFFFF',
          'primary',          '#6366f1',
          'headerBackground', '#6366f1',
          'textPrimary',      '#1a1a2e',
          'textSecondary',    '#6b7280',
          'surface',          '#FFFFFF',
          'border',           '#f1f5f9'
        ),
        'typography', jsonb_build_object(
          'fontFamily', 'inter'
        ),
        'header', jsonb_build_object(
          'imageBorderRadiusPx', 12
        ),
        'navigation', jsonb_build_object(
          'style', 'pill'
        ),
        'card', jsonb_build_object(
          'layout', 'list',
          'radius', 'rounded',
          'image', jsonb_build_object(
            'mode', 'show',
            'position', 'left'
          )
        )
      ),
      now()
    )
    RETURNING id INTO v_version_id;

    UPDATE public.styles
    SET
      current_version_id = v_version_id,
      updated_at = now()
    WHERE id = v_style_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_tenant_system_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    INSERT INTO public.profiles (
        id,
        first_name,
        last_name,
        phone,
        avatar_url,
        email,
        created_at,
        updated_at
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'last_name',
        NEW.raw_user_meta_data->>'phone',
        NEW.raw_user_meta_data->>'avatar_url',
        NEW.email,
        now(),
        now()
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_otp_attempt"("challenge_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  update public.otp_challenges
  set attempts = attempts + 1
  where id = challenge_id;
$$;


ALTER FUNCTION "public"."increment_otp_attempt"("challenge_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") RETURNS TABLE("membership_id" "uuid", "email" "text", "role" "text", "invite_token" "uuid", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id         uuid;
  v_status          text;
  v_existing_id     uuid;   -- row to UPDATE when re-inviting revoked/expired
  v_token           uuid;
  v_member_id       uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
BEGIN
  -- Caller must be an active owner or admin of this tenant.
  -- Table alias `tm` is required to avoid ambiguity with the output
  -- columns `status` and `role` declared in RETURNS TABLE above.
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Validate role: owner cannot be assigned via invite.
  -- Ownership transfer is only possible through transfer_ownership().
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'invalid_role: role must be admin or member'
      USING ERRCODE = '22000';
  END IF;

  -- Normalize email once at entry
  p_email := lower(trim(p_email));

  -- Try to resolve email → user_id from auth.users
  SELECT u.id INTO v_user_id
  FROM auth.users u
  WHERE lower(u.email) = p_email
  LIMIT 1;

  -- Unified lookup: covers both known-user rows (matched by user_id) and
  -- email-only rows (matched by invited_email). ORDER BY created_at DESC
  -- ensures the most-recent row is picked when historical rows exist.
  SELECT tm.id, tm.status
  INTO v_existing_id, v_status
  FROM public.tenant_memberships tm
  WHERE tm.tenant_id = p_tenant_id
    AND (
          tm.user_id              = v_user_id          -- NULL = NULL is false in SQL, safe
       OR lower(tm.invited_email) = p_email
    )
  ORDER BY tm.created_at DESC
  LIMIT 1;

  IF v_status = 'active'  THEN RAISE EXCEPTION 'user already member';    END IF;
  IF v_status = 'pending' THEN RAISE EXCEPTION 'invite already pending'; END IF;
  -- 'revoked' or 'expired': v_existing_id is set → will UPDATE below
  -- NULL (no row found): v_existing_id is NULL → will INSERT below

  -- Resolve data needed by the Edge Function email body
  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  -- Read internal shared secret from Vault
  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  IF v_existing_id IS NOT NULL THEN
    -- Re-invite: refresh the revoked/expired row in-place.
    -- UPDATE is not subject to the unique index (no new pending row is
    -- created), so no race condition applies here.
    UPDATE public.tenant_memberships
    SET
      role               = p_role,
      status             = 'pending',
      invited_by         = auth.uid(),
      invite_token       = v_token,
      invite_sent_at     = now(),
      invite_expires_at  = now() + interval '7 days',
      invite_accepted_at = NULL,
      -- If we now know the user_id, attach it and clear the email field
      user_id            = COALESCE(v_user_id, user_id),
      invited_email      = CASE WHEN v_user_id IS NOT NULL THEN NULL ELSE p_email END
    WHERE id = v_existing_id
    RETURNING id INTO v_member_id;

  ELSE
    -- Fresh invite: insert new row.
    -- Nested block catches unique_violation from a concurrent INSERT that
    -- races past the lookup above.
    BEGIN
      INSERT INTO public.tenant_memberships (
        tenant_id,
        user_id,
        invited_email,
        role,
        status,
        invited_by,
        invite_token,
        invite_sent_at,
        invite_expires_at
      ) VALUES (
        p_tenant_id,
        v_user_id,
        CASE WHEN v_user_id IS NULL THEN p_email ELSE NULL END,
        p_role,
        'pending',
        auth.uid(),
        v_token,
        now(),
        now() + interval '7 days'
      )
      RETURNING id INTO v_member_id;

    EXCEPTION
      WHEN unique_violation THEN
        -- Another transaction inserted a pending invite for this email
        -- between our lookup and this INSERT.
        RAISE EXCEPTION 'invite already pending';
    END;
  END IF;

  -- Fire-and-forget: send invite email via pg_net
  PERFORM net.http_post(
    url     := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        p_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN QUERY SELECT v_member_id, p_email, p_role, v_token, 'pending'::text;
END;
$$;


ALTER FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "rule_type" "text" NOT NULL,
    "target_type" "text",
    "target_id" "uuid",
    "priority" integer DEFAULT 10 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "is_baseline" boolean DEFAULT false NOT NULL,
    "time_mode" "text" NOT NULL,
    "days_of_week" integer[],
    "time_from" time without time zone,
    "time_to" time without time zone,
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "apply_to_all" boolean DEFAULT false NOT NULL,
    "visibility_mode" "text" DEFAULT 'hide'::"text" NOT NULL,
    "name" "text",
    "priority_level" "public"."schedule_priority_level" DEFAULT 'medium'::"public"."schedule_priority_level" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "schedules_priority_range_check" CHECK ((("priority" >= 1) AND ("priority" <= 40))),
    CONSTRAINT "schedules_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['layout'::"text", 'price'::"text", 'visibility'::"text", 'featured'::"text"]))),
    CONSTRAINT "schedules_target_type_check" CHECK ((("target_type" IS NULL) OR ("target_type" = ANY (ARRAY['activity'::"text", 'activity_group'::"text", 'catalog'::"text"])))),
    CONSTRAINT "v2_schedules_target_type_check" CHECK (("target_type" = ANY (ARRAY['activity'::"text", 'activity_group'::"text", 'catalog'::"text"]))),
    CONSTRAINT "v2_schedules_time_mode_check" CHECK (("time_mode" = ANY (ARRAY['always'::"text", 'window'::"text"]))),
    CONSTRAINT "v2_schedules_visibility_mode_check" CHECK (("visibility_mode" = ANY (ARRAY['hide'::"text", 'disable'::"text"])))
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_schedule_active"("s" "public"."schedules") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_now  timestamptz := now() AT TIME ZONE 'Europe/Rome';
  v_time time        := (v_now)::time;
  v_dow  int         := extract(dow from v_now);
BEGIN

  IF s.enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  -- ALWAYS
  IF s.time_mode = 'always' THEN
    RETURN TRUE;
  END IF;

  -- WINDOW (days + time range)
  IF s.time_mode = 'window' THEN
    IF s.days_of_week IS NOT NULL THEN
      IF NOT (v_dow = ANY (s.days_of_week)) THEN
        RETURN FALSE;
      END IF;
    END IF;
    IF s.time_from IS NOT NULL AND s.time_to IS NOT NULL THEN
      IF NOT (v_time BETWEEN s.time_from AND s.time_to) THEN
        RETURN FALSE;
      END IF;
    END IF;
    RETURN TRUE;
  END IF;

  -- RANGE (date interval)
  IF s.time_mode = 'range' THEN
    IF s.start_at IS NOT NULL AND v_now < s.start_at THEN
      RETURN FALSE;
    END IF;
    IF s.end_at IS NOT NULL AND v_now > s.end_at THEN
      RETURN FALSE;
    END IF;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."is_schedule_active"("s" "public"."schedules") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_schedule_active_now"("days" smallint[], "start_t" time without time zone, "end_t" time without time zone, "tz" "text") RETURNS boolean
    LANGUAGE "plpgsql" STABLE
    AS $$
declare
  now_local timestamp;
  dow int;
  prev_dow int;
  now_min int;
  start_min int;
  end_min int;
begin
  if days is null or array_length(days, 1) is null then
    return false;
  end if;

  -- now in business timezone
  now_local := now() at time zone tz;

  -- postgres dow: 0=Sunday .. 6=Saturday (come JS getDay)
  dow := extract(dow from now_local)::int;
  prev_dow := (dow + 6) % 7;

  now_min := extract(hour from now_local)::int * 60 + extract(minute from now_local)::int;
  start_min := extract(hour from start_t)::int * 60 + extract(minute from start_t)::int;
  end_min := extract(hour from end_t)::int * 60 + extract(minute from end_t)::int;

  -- ALL DAY (start == end): attivo tutto il giorno se il day matcha
  if start_min = end_min then
    return dow = any(days);
  end if;

  -- SAME DAY
  if start_min < end_min then
    return (dow = any(days)) and (start_min <= now_min) and (now_min < end_min);
  end if;

  -- OVERNIGHT (start > end)
  return ((dow = any(days)) and (now_min >= start_min))
      or ((prev_dow = any(days)) and (now_min < end_min));
end;
$$;


ALTER FUNCTION "public"."is_schedule_active_now"("days" smallint[], "start_t" time without time zone, "end_t" time without time zone, "tz" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_is_owner boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.tenants
    WHERE id              = p_tenant_id
      AND owner_user_id   = auth.uid()
  ) INTO v_is_owner;

  IF v_is_owner THEN
    RAISE EXCEPTION 'owner_cannot_leave: the tenant owner cannot leave their own tenant'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.tenant_memberships
  SET status = 'left'
  WHERE tenant_id = p_tenant_id
    AND user_id   = auth.uid()
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'membership_not_found: no active membership for this user in tenant %', p_tenant_id
      USING ERRCODE = 'P0002';
  END IF;
END;
$$;


ALTER FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN

  UPDATE public.profiles
  SET    account_deleted_at = now()
  WHERE  id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'profile_not_found: no profile row found for user %', p_user_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Audit
  INSERT INTO public.v2_audit_events (event_type, actor_user_id, target_user_id, payload)
  VALUES (
    'account_deleted',
    p_user_id,
    p_user_id,
    jsonb_build_object()
  );

END;
$$;


ALTER FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_delete_system_styles"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.is_system = TRUE AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'cannot_delete_system_style';
  END IF;

  RETURN OLD;
END;
$$;


ALTER FUNCTION "public"."prevent_delete_system_styles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_deleted_at_client_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Only act when deleted_at is actually being changed.
  -- IS DISTINCT FROM handles NULL correctly (NULL → value and value → NULL both qualify).
  IF OLD.deleted_at IS DISTINCT FROM NEW.deleted_at THEN
    -- With SECURITY INVOKER, current_user is the PostgreSQL role of the
    -- calling session: 'authenticated' for REST clients, 'service_role' for
    -- the delete-tenant edge function.
    IF current_user != 'service_role' THEN
      RAISE EXCEPTION
        'permission_denied: deleted_at on v2_tenants can only be modified by service_role (current_user: %)',
        current_user
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_deleted_at_client_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_locked_expired_tenants"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_ids  uuid[];
  v_count       integer;
BEGIN

  -- Collect the IDs of tenants to be purged.
  SELECT ARRAY(
    SELECT id
    FROM   public.tenants
    WHERE  locked_at IS NOT NULL
      AND  locked_at < now() - interval '30 days'
  ) INTO v_tenant_ids;

  v_count := coalesce(array_length(v_tenant_ids, 1), 0);

  IF v_count = 0 THEN
    RETURN 0;
  END IF;

  -- Audit: insert one event per tenant while FK is still valid.
  INSERT INTO public.v2_audit_events (event_type, tenant_id, payload)
  SELECT 'tenant_purged', unnest(v_tenant_ids), jsonb_build_object();

  -- Delete expired locked tenants.
  -- CASCADE handles all child data — no manual child-table cleanup needed.
  -- ON DELETE SET NULL will null tenant_id on the audit rows just inserted.
  DELETE FROM public.tenants
  WHERE  id = ANY(v_tenant_ids);

  RETURN v_count;

END;
$$;


ALTER FUNCTION "public"."purge_locked_expired_tenants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."purge_user_data"("p_user_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_invited_by_cleared integer := 0;
    v_otp_deleted integer := 0;
    v_membership_deleted integer := 0;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'p_user_id cannot be null';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

    -- Step 1: Nullify invited_by
    UPDATE public.tenant_memberships
    SET invited_by = NULL
    WHERE invited_by = p_user_id;

    GET DIAGNOSTICS v_invited_by_cleared = ROW_COUNT;

    -- Step 2: Delete OTP rows
    DELETE FROM public.otp_session_verifications
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_otp_deleted = ROW_COUNT;

    -- Step 3: Delete memberships
    DELETE FROM public.tenant_memberships
    WHERE user_id = p_user_id;

    GET DIAGNOSTICS v_membership_deleted = ROW_COUNT;

    RETURN jsonb_build_object(
        'invited_by_cleared', v_invited_by_cleared,
        'otp_rows_deleted', v_otp_deleted,
        'membership_rows_deleted', v_membership_deleted,
        'profile_deleted', false
    );
END;
$$;


ALTER FUNCTION "public"."purge_user_data"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_target_role text;
  v_updated_count integer;
BEGIN
  -- Guard: caller cannot remove themselves (use leave_tenant instead)
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot remove yourself: use leave_tenant instead';
  END IF;

  -- Guard: caller must be an active owner or admin of this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  -- Resolve target member's role
  SELECT role
  INTO v_target_role
  FROM public.tenant_memberships
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'member not found';
  END IF;

  -- Guard: cannot remove the tenant owner
  IF v_target_role = 'owner' THEN
    RAISE EXCEPTION 'cannot remove owner';
  END IF;

  -- Soft-delete: mark as 'left' (consistent with leave_tenant)
  UPDATE public.tenant_memberships
  SET
    status     = 'left',
    updated_at = now()
  WHERE tenant_id = p_tenant_id
    AND user_id   = p_user_id
    AND status    = 'active';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count = 0 THEN
    RAISE EXCEPTION 'member not found';
  END IF;
END;
$$;


ALTER FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resend_invite"("p_membership_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id       uuid;
  v_status          text;
  v_email           text;
  v_role            text;
  v_token           uuid;
  v_tenant_name     text;
  v_inviter_email   text;
  v_internal_secret text;
  v_updated_id      uuid;
BEGIN
  SELECT
    tm.tenant_id,
    tm.status,
    COALESCE(u.email, tm.invited_email),
    tm.role
  INTO v_tenant_id, v_status, v_email, v_role
  FROM public.tenant_memberships tm
  LEFT JOIN auth.users u ON u.id = tm.user_id
  WHERE tm.id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF v_status = 'active' THEN
    RAISE EXCEPTION 'cannot resend invite to an active member';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships tm
    WHERE tm.tenant_id = v_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.status    = 'active'
      AND tm.role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  SELECT t.name INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = v_tenant_id;

  SELECT u.email INTO v_inviter_email
  FROM auth.users u
  WHERE u.id = auth.uid();

  SELECT decrypted_secret INTO v_internal_secret
  FROM vault.decrypted_secrets
  WHERE name = 'internal_edge_secret'
  LIMIT 1;

  v_token := gen_random_uuid();

  UPDATE public.tenant_memberships
  SET
    status             = 'pending',
    invite_token       = v_token,
    invite_sent_at     = now(),
    invite_expires_at  = now() + interval '7 days',
    invite_accepted_at = NULL,
    invited_by         = auth.uid()
  WHERE id = p_membership_id
  RETURNING id INTO v_updated_id;

  PERFORM net.http_post(
    url     := 'https://lxeawrpjfphgdspueiag.supabase.co/functions/v1/send-tenant-invite',
    headers := jsonb_build_object(
      'Content-Type',      'application/json',
      'X-Internal-Secret', coalesce(v_internal_secret, '')
    ),
    body    := jsonb_build_object(
      'email',        v_email,
      'tenantName',   coalesce(v_tenant_name, ''),
      'inviterEmail', coalesce(v_inviter_email, ''),
      'inviteToken',  v_token::text
    )
  );

  RETURN v_updated_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."resend_invite"("p_membership_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tenant_id  uuid;
  v_revoked_id uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id
  FROM public.tenant_memberships
  WHERE id = p_membership_id;

  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.tenant_memberships
    WHERE tenant_id = v_tenant_id
      AND user_id   = auth.uid()
      AND status    = 'active'
      AND role      IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  UPDATE public.tenant_memberships
  SET
    status       = 'revoked',
    invite_token = NULL
  WHERE id     = p_membership_id
    AND status = 'pending'
  RETURNING id INTO v_revoked_id;

  RETURN v_revoked_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."simple_slug"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select lower(regexp_replace(trim(input), '[^a-zA-Z0-9]+', '-', 'g'));
$$;


ALTER FUNCTION "public"."simple_slug"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_profile_email"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
    UPDATE public.profiles
    SET    email = NEW.email
    WHERE  id    = NEW.id;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_profile_email"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_current_owner_user_id  uuid;
  v_owner_count            int;
BEGIN

  -- Guard 1: caller must be the active owner of this tenant.
  SELECT user_id
  INTO   v_current_owner_user_id
  FROM   public.tenant_memberships
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = auth.uid()
    AND  role      = 'owner'
    AND  status    = 'active'
  FOR UPDATE;

  IF v_current_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authorized: caller is not the active owner of this tenant'
      USING ERRCODE = '42501';
  END IF;

  PERFORM id
  FROM    public.tenants
  WHERE   id = p_tenant_id
  FOR UPDATE;

  -- Guard 2: prevent no-op transfer to self
  IF p_new_owner_user_id = v_current_owner_user_id THEN
    RAISE EXCEPTION 'already_owner: the target user is already the owner of this tenant'
      USING ERRCODE = '22000';
  END IF;

  -- Guard 3: target must have an active membership in this tenant
  IF NOT EXISTS (
    SELECT 1
    FROM   public.tenant_memberships
    WHERE  tenant_id = p_tenant_id
      AND  user_id   = p_new_owner_user_id
      AND  status    = 'active'
  ) THEN
    RAISE EXCEPTION 'invalid_target_user: target user is not an active member of this tenant'
      USING ERRCODE = 'P0002';
  END IF;

  -- Step A: downgrade current owner to admin
  UPDATE public.tenant_memberships
  SET    role = 'admin'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = v_current_owner_user_id
    AND  role      = 'owner'
    AND  status    = 'active';

  -- Step B: promote target member to owner
  UPDATE public.tenant_memberships
  SET    role = 'owner'
  WHERE  tenant_id = p_tenant_id
    AND  user_id   = p_new_owner_user_id
    AND  status    = 'active';

  -- Step C: sync tenants.owner_user_id (hybrid-model requirement)
  UPDATE public.tenants
  SET    owner_user_id = p_new_owner_user_id
  WHERE  id = p_tenant_id;

  -- Step D: reset Stripe fields — new owner must create their own subscription.
  -- The calling Edge Function is responsible for cancelling the subscription
  -- in Stripe before this RPC runs.
  UPDATE public.tenants
  SET    stripe_customer_id     = NULL,
         stripe_subscription_id = NULL,
         subscription_status    = 'trialing',
         trial_until            = (now() + interval '14 days'),
         paid_seats             = 1
  WHERE  id = p_tenant_id;

  -- Post-transfer invariant check
  SELECT COUNT(*)
  INTO   v_owner_count
  FROM   public.tenant_memberships
  WHERE  tenant_id = p_tenant_id
    AND  role      = 'owner'
    AND  status    = 'active';

  IF v_owner_count != 1 THEN
    RAISE EXCEPTION 'ownership_invariant_violation: expected 1 active owner after transfer, found %', v_owner_count
      USING ERRCODE = 'P0001';
  END IF;

END;
$$;


ALTER FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_check_product_group_depth"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_parent_tenant_id uuid;
  v_parent_parent_id uuid;
BEGIN
  IF new.parent_group_id IS NOT NULL THEN
    SELECT tenant_id, parent_group_id
    INTO v_parent_tenant_id, v_parent_parent_id
    FROM public.product_groups
    WHERE id = new.parent_group_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Parent group % does not exist.', new.parent_group_id;
    END IF;

    IF new.tenant_id != v_parent_tenant_id THEN
      RAISE EXCEPTION 'Cross-tenant groups are not allowed.';
    END IF;

    IF v_parent_parent_id IS NOT NULL THEN
      RAISE EXCEPTION 'Sub-sub-groups are not allowed.';
    END IF;
  END IF;

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."trg_check_product_group_depth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_check_product_group_items_tenant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_product_tenant_id uuid;
  v_group_tenant_id   uuid;
BEGIN
  SELECT tenant_id INTO v_product_tenant_id
  FROM public.products
  WHERE id = new.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product ID % does not exist.', new.product_id;
  END IF;

  SELECT tenant_id INTO v_group_tenant_id
  FROM public.product_groups
  WHERE id = new.group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group ID % does not exist.', new.group_id;
  END IF;

  IF new.tenant_id != v_product_tenant_id
     OR new.tenant_id != v_group_tenant_id THEN
    RAISE EXCEPTION 'Tenant mismatch in product-group assignment.';
  END IF;

  RETURN new;
END;
$$;


ALTER FUNCTION "public"."trg_check_product_group_items_tenant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_check_product_variant"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    v_parent_tenant_id uuid;
    v_parent_parent_id uuid;
BEGIN
    IF new.parent_product_id IS NOT NULL THEN
        SELECT tenant_id, parent_product_id
          INTO v_parent_tenant_id, v_parent_parent_id
          FROM public.products
         WHERE id = new.parent_product_id;

        -- Rule A: variant must belong to the same tenant as its parent
        IF new.tenant_id != v_parent_tenant_id THEN
            RAISE EXCEPTION 'variant tenant_id (%) does not match parent tenant_id (%)',
                new.tenant_id, v_parent_tenant_id;
        END IF;

        -- Rule B: variants of variants are not allowed (max depth = 1)
        IF v_parent_parent_id IS NOT NULL THEN
            RAISE EXCEPTION 'cannot create a variant of a variant (product id: %)',
                new.parent_product_id;
        END IF;
    END IF;

    RETURN new;
END;
$$;


ALTER FUNCTION "public"."trg_check_product_variant"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_check_variant_assignment"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_actual_parent UUID;
BEGIN
  SELECT parent_product_id
  INTO   v_actual_parent
  FROM   public.products
  WHERE  id = NEW.variant_product_id;

  -- If the product doesn't exist the FK constraint will fire; be explicit anyway.
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'variant_product_id % does not exist in products',
      NEW.variant_product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- The variant must have parent_product_id = the parent we are assigning to.
  IF v_actual_parent IS DISTINCT FROM NEW.parent_product_id THEN
    RAISE EXCEPTION
      'Coherence violation: product % has parent_product_id = %, but assignment references parent %.',
      NEW.variant_product_id, v_actual_parent, NEW.parent_product_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_check_variant_assignment"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_product_groups_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."trg_product_groups_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_count integer;
BEGIN

  -- -------------------------------------------------------------------------
  -- Guard: p_user_id must be provided
  -- -------------------------------------------------------------------------
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'missing_user_id: p_user_id must not be NULL'
      USING ERRCODE = '22000';
  END IF;

  -- -------------------------------------------------------------------------
  -- Unlock tenants: clear locked_at for all tenants owned by this user
  -- that are currently locked and not soft-deleted.
  -- Transferred tenants are naturally excluded because their owner_user_id
  -- no longer matches p_user_id.
  -- -------------------------------------------------------------------------
  UPDATE public.tenants
  SET    locked_at = NULL
  WHERE  owner_user_id = p_user_id
    AND  locked_at     IS NOT NULL
    AND  deleted_at    IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;

END;
$$;


ALTER FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  -- Guard: richiede utente autenticato
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Autorizza owner diretto O admin attivo del tenant
  IF NOT EXISTS (
    -- Branch A: owner del tenant
    SELECT 1 FROM public.tenants
    WHERE id          = p_tenant_id
      AND owner_user_id = auth.uid()
      AND deleted_at  IS NULL
  ) AND NOT EXISTS (
    -- Branch B: membro con ruolo owner o admin
    SELECT 1
    FROM public.tenant_memberships tm
    JOIN public.tenants t ON t.id = tm.tenant_id
    WHERE tm.tenant_id = p_tenant_id
      AND tm.user_id   = auth.uid()
      AND tm.role      IN ('owner', 'admin')
      AND tm.status    = 'active'
      AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.tenants SET logo_url = p_logo_url WHERE id = p_tenant_id;
END;
$$;


ALTER FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_ccp_variant_parent"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.variant_product_id IS NOT NULL THEN
    IF NEW.variant_product_id = NEW.product_id THEN
      RAISE EXCEPTION 'variant_product_id cannot be equal to product_id';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM products
      WHERE id = NEW.variant_product_id
        AND parent_product_id = NEW.product_id
    ) THEN
      RAISE EXCEPTION 'variant_product_id % is not a variant of product_id %',
        NEW.variant_product_id, NEW.product_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validate_ccp_variant_parent"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "activity_type" "text",
    "address" "text",
    "city" "text",
    "cover_image" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text",
    "phone" "text",
    "email_public" "text",
    "website" "text",
    "instagram" "text",
    "facebook" "text",
    "whatsapp" "text",
    "phone_public" boolean DEFAULT false NOT NULL,
    "email_public_visible" boolean DEFAULT false NOT NULL,
    "website_public" boolean DEFAULT false NOT NULL,
    "instagram_public" boolean DEFAULT false NOT NULL,
    "facebook_public" boolean DEFAULT false NOT NULL,
    "whatsapp_public" boolean DEFAULT false NOT NULL,
    "payment_methods" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "payment_methods_public" boolean DEFAULT false NOT NULL,
    "services" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "services_public" boolean DEFAULT false NOT NULL,
    "qr_fg_color" "text" DEFAULT '#000000'::"text",
    "qr_bg_color" "text" DEFAULT '#FFFFFF'::"text",
    "inactive_reason" "text",
    "google_review_url" "text",
    CONSTRAINT "activities_inactive_reason_check" CHECK (("inactive_reason" = ANY (ARRAY['maintenance'::"text", 'closed'::"text", 'unavailable'::"text"]))),
    CONSTRAINT "activities_slug_format" CHECK (("slug" ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'::"text")),
    CONSTRAINT "activities_slug_length" CHECK ((("char_length"("slug") >= 3) AND ("char_length"("slug") <= 60)))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_group_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_group_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."activity_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_hours" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "opens_at" time without time zone,
    "closes_at" time without time zone,
    "is_closed" boolean DEFAULT false NOT NULL,
    "hours_public" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "activity_hours_day_of_week_check" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6)))
);


ALTER TABLE "public"."activity_hours" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_media" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "url" "text" NOT NULL,
    "type" "text" DEFAULT 'image'::"text" NOT NULL,
    "is_cover" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_product_overrides" (
    "id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "price_override" numeric,
    "visible_override" boolean,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_product_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."allergens" (
    "id" smallint NOT NULL,
    "code" "text" NOT NULL,
    "label_it" "text" NOT NULL,
    "label_en" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."allergens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "session_id" "uuid",
    "device_type" "text",
    "screen_width" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_device_type" CHECK ((("device_type" IS NULL) OR ("device_type" = ANY (ARRAY['mobile'::"text", 'tablet'::"text", 'desktop'::"text"])))),
    CONSTRAINT "valid_event_type" CHECK (("event_type" = ANY (ARRAY['page_view'::"text", 'product_detail_open'::"text", 'selection_add'::"text", 'selection_remove'::"text", 'selection_sheet_open'::"text", 'featured_click'::"text", 'social_click'::"text", 'search_performed'::"text", 'tab_switch'::"text", 'section_view'::"text", 'review_submitted'::"text", 'review_google_redirect'::"text"])))
);


ALTER TABLE "public"."analytics_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "event_type" "text" NOT NULL,
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "catalog_id" "uuid" NOT NULL,
    "parent_category_id" "uuid",
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "level" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "v2_catalog_categories_level_check" CHECK (("level" = ANY (ARRAY[1, 2, 3])))
);


ALTER TABLE "public"."catalog_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_category_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "catalog_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "variant_product_id" "uuid"
);


ALTER TABLE "public"."catalog_category_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catalog_id" "uuid" NOT NULL,
    "section_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."catalog_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalog_sections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "catalog_id" "uuid" NOT NULL,
    "label" "text",
    "order_index" integer DEFAULT 0 NOT NULL,
    "base_category_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."catalog_sections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."catalogs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "catalog_type" "text",
    "kind" "text",
    "style" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."catalogs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."featured_content_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "featured_content_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."featured_content_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."featured_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "subtitle" "text",
    "description" "text",
    "media_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "internal_name" "text" NOT NULL,
    "cta_text" "text",
    "cta_url" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "layout_style" "text",
    "pricing_mode" "text" DEFAULT 'none'::"text" NOT NULL,
    "bundle_price" numeric,
    "show_original_total" boolean DEFAULT false NOT NULL,
    CONSTRAINT "v2_featured_contents_pricing_mode_check" CHECK (("pricing_mode" = ANY (ARRAY['none'::"text", 'per_item'::"text", 'bundle'::"text"]))),
    CONSTRAINT "v2_featured_contents_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."featured_contents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_memberships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "role" "text" NOT NULL,
    "status" "text" NOT NULL,
    "invited_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "invite_token" "uuid",
    "invited_email" "text",
    "invite_sent_at" timestamp with time zone DEFAULT "now"(),
    "invite_accepted_at" timestamp with time zone,
    "invite_expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval),
    CONSTRAINT "v2_tenant_memberships_has_user_or_email" CHECK ((("user_id" IS NOT NULL) OR ("invited_email" IS NOT NULL)))
);


ALTER TABLE "public"."tenant_memberships" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."my_pending_invites_view" AS
 SELECT "tm"."id" AS "membership_id",
    "tm"."tenant_id",
    "tm"."invite_token",
    "tm"."role",
    "tm"."status",
    "inviter"."email" AS "inviter_email"
   FROM ("public"."tenant_memberships" "tm"
     LEFT JOIN "auth"."users" "inviter" ON (("inviter"."id" = "tm"."invited_by")))
  WHERE (("tm"."status" = 'pending'::"text") AND ("tm"."invited_by" IS DISTINCT FROM "auth"."uid"()) AND (("tm"."invite_expires_at" IS NULL) OR ("tm"."invite_expires_at" > "now"())) AND (("lower"("tm"."invited_email") = "lower"("auth"."email"())) OR ("tm"."user_id" = "auth"."uid"())));


ALTER VIEW "public"."my_pending_invites_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_challenges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "code_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "consumed_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "max_attempts" integer DEFAULT 5 NOT NULL,
    "last_sent_at" timestamp with time zone DEFAULT "now"(),
    "send_count" integer DEFAULT 0 NOT NULL,
    "request_ip" "inet",
    "user_agent" "text",
    "window_start_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locked_until" timestamp with time zone
);


ALTER TABLE "public"."otp_challenges" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."otp_session_verifications" (
    "session_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "verified_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."otp_session_verifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plans" (
    "code" "text" NOT NULL,
    "max_activities" integer,
    "max_products" integer,
    "max_catalogs" integer
);


ALTER TABLE "public"."plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_allergens" (
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "allergen_id" smallint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."product_allergens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_attribute_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "type" "text" NOT NULL,
    "options" "jsonb",
    "is_required" boolean DEFAULT false NOT NULL,
    "vertical" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "show_in_public_channels" boolean DEFAULT true NOT NULL,
    "applies_to_variants" boolean DEFAULT true NOT NULL,
    "inherit_to_variants_by_default" boolean DEFAULT true NOT NULL,
    "product_type" "text",
    CONSTRAINT "v2_product_attribute_definitions_type_check" CHECK (("type" = ANY (ARRAY['text'::"text", 'number'::"text", 'boolean'::"text", 'select'::"text", 'multi_select'::"text"])))
);


ALTER TABLE "public"."product_attribute_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_attribute_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "attribute_definition_id" "uuid" NOT NULL,
    "value_text" "text",
    "value_number" numeric,
    "value_boolean" boolean,
    "value_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."product_attribute_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_group_items" (
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "group_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_group_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "parent_group_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_ingredients" (
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_option_groups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "max_selectable" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_kind" "text" DEFAULT 'ADDON'::"text" NOT NULL,
    "pricing_mode" "text" DEFAULT 'DELTA'::"text" NOT NULL,
    CONSTRAINT "v2_product_option_groups_group_kind_check" CHECK (("group_kind" = ANY (ARRAY['PRIMARY_PRICE'::"text", 'ADDON'::"text"]))),
    CONSTRAINT "v2_product_option_groups_max_selectable_check" CHECK ((("max_selectable" IS NULL) OR ("max_selectable" > 0))),
    CONSTRAINT "v2_product_option_groups_pricing_mode_check" CHECK (("pricing_mode" = ANY (ARRAY['ABSOLUTE'::"text", 'DELTA'::"text"])))
);


ALTER TABLE "public"."product_option_groups" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_option_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "option_group_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price_modifier" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "absolute_price" numeric(10,2)
);


ALTER TABLE "public"."product_option_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variant_assignment_values" (
    "assignment_id" "uuid" NOT NULL,
    "dimension_value_id" "uuid" NOT NULL
);


ALTER TABLE "public"."product_variant_assignment_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variant_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "parent_product_id" "uuid" NOT NULL,
    "variant_product_id" "uuid" NOT NULL,
    "combination_key" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_variant_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variant_dimension_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "dimension_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_variant_dimension_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."product_variant_dimensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."product_variant_dimensions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "base_price" numeric,
    "parent_product_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_url" "text",
    "product_type" "text" DEFAULT 'simple'::"text" NOT NULL,
    "variant_strategy" "text" DEFAULT 'manual'::"text" NOT NULL,
    CONSTRAINT "products_product_type_check" CHECK (("product_type" = ANY (ARRAY['simple'::"text", 'formats'::"text", 'configurable'::"text"]))),
    CONSTRAINT "products_variant_strategy_check" CHECK (("variant_strategy" = ANY (ARRAY['manual'::"text", 'matrix'::"text"])))
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "first_name" "text",
    "last_name" "text",
    "phone" "text",
    "updated_at" timestamp with time zone,
    "account_deleted_at" timestamp with time zone,
    "email" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."qr_scans" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "business_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."qr_scans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "rating" integer NOT NULL,
    "rating_category" "text" NOT NULL,
    "comment" "text",
    "source" "text" DEFAULT 'public_form'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "session_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_category_check" CHECK (("rating_category" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text"]))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_source_check" CHECK (("source" = ANY (ARRAY['public_form'::"text", 'internal'::"text", 'google'::"text"]))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_featured_contents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "featured_content_id" "uuid" NOT NULL,
    "slot" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "v2_schedule_featured_contents_slot_check" CHECK (("slot" = ANY (ARRAY['hero'::"text", 'before_catalog'::"text", 'after_catalog'::"text"])))
);


ALTER TABLE "public"."schedule_featured_contents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_layout" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "style_id" "uuid" NOT NULL,
    "catalog_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL
);


ALTER TABLE "public"."schedule_layout" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_price_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "override_price" numeric NOT NULL,
    "show_original_price" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "option_value_id" "uuid"
);


ALTER TABLE "public"."schedule_price_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_targets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "target_type" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "v2_schedule_targets_target_type_check" CHECK (("target_type" = ANY (ARRAY['activity'::"text", 'activity_group'::"text"])))
);


ALTER TABLE "public"."schedule_targets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_visibility_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "visible" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "mode" "text",
    CONSTRAINT "v2_schedule_visibility_overrides_mode_check" CHECK ((("visible" = true) OR ("mode" = ANY (ARRAY['hide'::"text", 'disable'::"text"]))))
);


ALTER TABLE "public"."schedule_visibility_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."style_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "style_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "config" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."style_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."styles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "current_version_id" "uuid"
);


ALTER TABLE "public"."styles" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."tenant_members_view" AS
 SELECT "tm"."id" AS "membership_id",
    "tm"."tenant_id",
    "tm"."user_id",
    COALESCE("u"."email", ("tm"."invited_email")::character varying) AS "email",
    "tm"."role",
    "tm"."status",
    "tm"."invited_by",
    "inviter"."email" AS "inviter_email",
    "tm"."invite_token",
    "tm"."invite_expires_at",
    "tm"."created_at"
   FROM (("public"."tenant_memberships" "tm"
     LEFT JOIN "auth"."users" "u" ON (("u"."id" = "tm"."user_id")))
     LEFT JOIN "auth"."users" "inviter" ON (("inviter"."id" = "tm"."invited_by")))
  WHERE ("tm"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"));


ALTER VIEW "public"."tenant_members_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "vertical_type" "text" DEFAULT 'restaurant'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "owner_user_id" "uuid" NOT NULL,
    "deleted_at" timestamp with time zone,
    "plan" "text" DEFAULT 'pro'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'trialing'::"text" NOT NULL,
    "trial_until" timestamp with time zone,
    "locked_at" timestamp with time zone,
    "logo_url" "text",
    "business_subtype" "text",
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "paid_seats" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "tenants_business_subtype_check" CHECK ((("business_subtype" = ANY (ARRAY['restaurant'::"text", 'bar'::"text", 'pizzeria'::"text", 'cafe'::"text"])) OR ("business_subtype" IS NULL))),
    CONSTRAINT "tenants_paid_seats_check" CHECK (("paid_seats" >= 1)),
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = 'pro'::"text")),
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['trialing'::"text", 'active'::"text", 'past_due'::"text", 'suspended'::"text", 'canceled'::"text"]))),
    CONSTRAINT "tenants_vertical_type_check" CHECK (("vertical_type" = ANY (ARRAY['food_beverage'::"text", 'restaurant'::"text", 'bar'::"text", 'retail'::"text", 'hotel'::"text", 'generic'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."user_tenants_view" AS
 SELECT "id",
    "name",
    "vertical_type",
    "business_subtype",
    "created_at",
    "owner_user_id",
    "user_role",
    "logo_url",
    "plan",
    "subscription_status",
    "trial_until",
    "stripe_customer_id",
    "stripe_subscription_id",
    "paid_seats"
   FROM "public"."get_user_tenants"() "get_user_tenants"("id", "name", "vertical_type", "business_subtype", "created_at", "owner_user_id", "user_role", "logo_url", "plan", "subscription_status", "trial_until", "stripe_customer_id", "stripe_subscription_id", "paid_seats");


ALTER VIEW "public"."user_tenants_view" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."v2_audit_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_type" "text" NOT NULL,
    "actor_user_id" "uuid",
    "target_user_id" "uuid",
    "tenant_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."v2_audit_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."v2_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid",
    "event_type" "text" NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title" "text",
    "message" "text",
    "type" "text" DEFAULT 'system'::"text" NOT NULL,
    CONSTRAINT "v2_notifications_type_check" CHECK (("type" = ANY (ARRAY['system'::"text", 'promo'::"text", 'info'::"text", 'invite'::"text", 'warning'::"text", 'ownership'::"text"])))
);


ALTER TABLE "public"."v2_notifications" OWNER TO "postgres";


ALTER TABLE ONLY "public"."activity_hours"
    ADD CONSTRAINT "activity_hours_activity_id_day_of_week_key" UNIQUE ("activity_id", "day_of_week");



ALTER TABLE ONLY "public"."activity_hours"
    ADD CONSTRAINT "activity_hours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_media"
    ADD CONSTRAINT "activity_media_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_challenges"
    ADD CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."otp_session_verifications"
    ADD CONSTRAINT "otp_session_verifications_pkey" PRIMARY KEY ("session_id");



ALTER TABLE ONLY "public"."product_variant_assignment_values"
    ADD CONSTRAINT "product_variant_assignment_values_pkey" PRIMARY KEY ("assignment_id", "dimension_value_id");



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_parent_combination_key" UNIQUE ("parent_product_id", "combination_key");



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_parent_variant_key" UNIQUE ("parent_product_id", "variant_product_id");



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variant_dimension_values"
    ADD CONSTRAINT "product_variant_dimension_values_dimension_label_key" UNIQUE ("dimension_id", "label");



ALTER TABLE ONLY "public"."product_variant_dimension_values"
    ADD CONSTRAINT "product_variant_dimension_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variant_dimensions"
    ADD CONSTRAINT "product_variant_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_variant_dimensions"
    ADD CONSTRAINT "product_variant_dimensions_product_name_key" UNIQUE ("product_id", "name");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."qr_scans"
    ADD CONSTRAINT "qr_scans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "v2_activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "v2_activities_tenant_id_slug_key" UNIQUE ("tenant_id", "slug");



ALTER TABLE ONLY "public"."activity_group_members"
    ADD CONSTRAINT "v2_activity_group_members_group_id_activity_id_key" UNIQUE ("group_id", "activity_id");



ALTER TABLE ONLY "public"."activity_group_members"
    ADD CONSTRAINT "v2_activity_group_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_groups"
    ADD CONSTRAINT "v2_activity_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_groups"
    ADD CONSTRAINT "v2_activity_groups_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."activity_product_overrides"
    ADD CONSTRAINT "v2_activity_product_overrides_activity_id_product_id_key" UNIQUE ("activity_id", "product_id");



ALTER TABLE ONLY "public"."activity_product_overrides"
    ADD CONSTRAINT "v2_activity_product_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."allergens"
    ADD CONSTRAINT "v2_allergens_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."allergens"
    ADD CONSTRAINT "v2_allergens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_audit_events"
    ADD CONSTRAINT "v2_audit_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "v2_audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_categories"
    ADD CONSTRAINT "v2_catalog_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "v2_catalog_category_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "v2_catalog_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalog_sections"
    ADD CONSTRAINT "v2_catalog_sections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."catalogs"
    ADD CONSTRAINT "v2_catalogs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."featured_content_products"
    ADD CONSTRAINT "v2_featured_content_products_featured_content_id_product_id_key" UNIQUE ("featured_content_id", "product_id");



ALTER TABLE ONLY "public"."featured_content_products"
    ADD CONSTRAINT "v2_featured_content_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."featured_contents"
    ADD CONSTRAINT "v2_featured_contents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "v2_ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."v2_notifications"
    ADD CONSTRAINT "v2_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plans"
    ADD CONSTRAINT "v2_plans_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "v2_product_allergens_pkey" PRIMARY KEY ("product_id", "allergen_id");



ALTER TABLE ONLY "public"."product_attribute_definitions"
    ADD CONSTRAINT "v2_product_attribute_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attribute_definitions"
    ADD CONSTRAINT "v2_product_attribute_definitions_tenant_id_code_key" UNIQUE ("tenant_id", "code");



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "v2_product_attribute_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "v2_product_attribute_values_product_id_attribute_definition_key" UNIQUE ("product_id", "attribute_definition_id");



ALTER TABLE ONLY "public"."product_group_items"
    ADD CONSTRAINT "v2_product_group_items_pkey" PRIMARY KEY ("product_id", "group_id");



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "v2_product_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "v2_product_ingredients_pkey" PRIMARY KEY ("product_id", "ingredient_id");



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "v2_product_option_groups_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."product_option_values"
    ADD CONSTRAINT "v2_product_option_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "v2_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_featured_contents"
    ADD CONSTRAINT "v2_schedule_featured_contents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_featured_contents"
    ADD CONSTRAINT "v2_schedule_featured_contents_schedule_id_featured_content__key" UNIQUE ("schedule_id", "featured_content_id");



ALTER TABLE ONLY "public"."schedule_layout"
    ADD CONSTRAINT "v2_schedule_layout_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_price_overrides"
    ADD CONSTRAINT "v2_schedule_price_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_targets"
    ADD CONSTRAINT "v2_schedule_targets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_visibility_overrides"
    ADD CONSTRAINT "v2_schedule_visibility_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_visibility_overrides"
    ADD CONSTRAINT "v2_schedule_visibility_overrides_schedule_id_product_id_key" UNIQUE ("schedule_id", "product_id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "v2_schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."style_versions"
    ADD CONSTRAINT "v2_style_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."styles"
    ADD CONSTRAINT "v2_styles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_memberships"
    ADD CONSTRAINT "v2_tenant_memberships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "v2_tenants_pkey" PRIMARY KEY ("id");



CREATE INDEX "activity_media_activity_id_idx" ON "public"."activity_media" USING "btree" ("activity_id");



CREATE UNIQUE INDEX "activity_media_single_cover" ON "public"."activity_media" USING "btree" ("activity_id") WHERE ("is_cover" = true);



CREATE INDEX "activity_media_sort_idx" ON "public"."activity_media" USING "btree" ("activity_id", "sort_order", "created_at" DESC);



CREATE INDEX "audit_logs_created_idx" ON "public"."audit_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "audit_logs_tenant_idx" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "audit_logs_user_idx" ON "public"."audit_logs" USING "btree" ("user_id");



CREATE INDEX "idx_analytics_events_activity_type_created" ON "public"."analytics_events" USING "btree" ("activity_id", "event_type", "created_at" DESC);



CREATE INDEX "idx_analytics_events_session" ON "public"."analytics_events" USING "btree" ("session_id", "created_at" DESC);



CREATE INDEX "idx_analytics_events_tenant_created" ON "public"."analytics_events" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "idx_option_groups_tenant_product_kind" ON "public"."product_option_groups" USING "btree" ("tenant_id", "product_id", "group_kind");



CREATE INDEX "idx_option_values_tenant_group" ON "public"."product_option_values" USING "btree" ("tenant_id", "option_group_id");



CREATE INDEX "idx_product_variant_assignment_values_dim_value_id" ON "public"."product_variant_assignment_values" USING "btree" ("dimension_value_id");



CREATE INDEX "idx_product_variant_assignments_parent_id" ON "public"."product_variant_assignments" USING "btree" ("parent_product_id");



CREATE INDEX "idx_product_variant_assignments_variant_id" ON "public"."product_variant_assignments" USING "btree" ("variant_product_id");



CREATE INDEX "idx_product_variant_dimension_values_dimension_id" ON "public"."product_variant_dimension_values" USING "btree" ("dimension_id");



CREATE INDEX "idx_product_variant_dimension_values_tenant_id" ON "public"."product_variant_dimension_values" USING "btree" ("tenant_id");



CREATE INDEX "idx_product_variant_dimensions_product_id" ON "public"."product_variant_dimensions" USING "btree" ("product_id");



CREATE INDEX "idx_product_variant_dimensions_tenant_id" ON "public"."product_variant_dimensions" USING "btree" ("tenant_id");



CREATE INDEX "idx_profiles_account_deleted_at_not_null" ON "public"."profiles" USING "btree" ("account_deleted_at") WHERE ("account_deleted_at" IS NOT NULL);



CREATE INDEX "idx_reviews_activity_status_created" ON "public"."reviews" USING "btree" ("activity_id", "status", "created_at" DESC);



CREATE INDEX "idx_reviews_tenant_id" ON "public"."reviews" USING "btree" ("tenant_id");



CREATE INDEX "idx_tenants_locked_at_not_null" ON "public"."tenants" USING "btree" ("locked_at") WHERE ("locked_at" IS NOT NULL);



CREATE INDEX "idx_v2_attr_def_tenant" ON "public"."product_attribute_definitions" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_attr_val_def" ON "public"."product_attribute_values" USING "btree" ("attribute_definition_id");



CREATE INDEX "idx_v2_attr_val_product" ON "public"."product_attribute_values" USING "btree" ("product_id");



CREATE INDEX "idx_v2_attr_val_tenant" ON "public"."product_attribute_values" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_catalog_cat_catalog" ON "public"."catalog_categories" USING "btree" ("catalog_id");



CREATE INDEX "idx_v2_catalog_cat_parent" ON "public"."catalog_categories" USING "btree" ("parent_category_id");



CREATE INDEX "idx_v2_catalog_cat_tenant" ON "public"."catalog_categories" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_catalog_items_tenant_id" ON "public"."catalog_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_catalog_prod_catalog" ON "public"."catalog_category_products" USING "btree" ("catalog_id");



CREATE INDEX "idx_v2_catalog_prod_category" ON "public"."catalog_category_products" USING "btree" ("category_id");



CREATE INDEX "idx_v2_catalog_prod_product" ON "public"."catalog_category_products" USING "btree" ("product_id");



CREATE INDEX "idx_v2_catalog_prod_tenant" ON "public"."catalog_category_products" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_catalog_sections_tenant_id" ON "public"."catalog_sections" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_featured_content_products_featured" ON "public"."featured_content_products" USING "btree" ("featured_content_id");



CREATE INDEX "idx_v2_featured_content_products_product" ON "public"."featured_content_products" USING "btree" ("product_id");



CREATE INDEX "idx_v2_featured_content_products_tenant" ON "public"."featured_content_products" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_featured_contents_tenant" ON "public"."featured_contents" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_prod_allergens_tenant_product" ON "public"."product_allergens" USING "btree" ("tenant_id", "product_id");



CREATE INDEX "idx_v2_product_group_items_group_id" ON "public"."product_group_items" USING "btree" ("group_id");



CREATE INDEX "idx_v2_product_group_items_product_id" ON "public"."product_group_items" USING "btree" ("product_id");



CREATE INDEX "idx_v2_product_group_items_tenant_id" ON "public"."product_group_items" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_product_groups_tenant_id" ON "public"."product_groups" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_product_groups_tenant_parent" ON "public"."product_groups" USING "btree" ("tenant_id", "parent_group_id");



CREATE INDEX "idx_v2_product_option_groups_product" ON "public"."product_option_groups" USING "btree" ("product_id");



CREATE INDEX "idx_v2_product_option_groups_tenant" ON "public"."product_option_groups" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_product_option_values_group" ON "public"."product_option_values" USING "btree" ("option_group_id");



CREATE INDEX "idx_v2_product_option_values_tenant" ON "public"."product_option_values" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_products_created" ON "public"."products" USING "btree" ("created_at");



CREATE INDEX "idx_v2_products_parent" ON "public"."products" USING "btree" ("parent_product_id");



CREATE INDEX "idx_v2_products_tenant" ON "public"."products" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_sched_feat_cont_featured" ON "public"."schedule_featured_contents" USING "btree" ("featured_content_id");



CREATE INDEX "idx_v2_sched_feat_cont_schedule" ON "public"."schedule_featured_contents" USING "btree" ("schedule_id");



CREATE INDEX "idx_v2_sched_feat_cont_tenant" ON "public"."schedule_featured_contents" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_schedule_layout_tenant_id" ON "public"."schedule_layout" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_schedule_price_overrides_tenant_id" ON "public"."schedule_price_overrides" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_schedule_visibility_overrides_tenant_id" ON "public"."schedule_visibility_overrides" USING "btree" ("tenant_id");



CREATE INDEX "idx_v2_tenants_deleted_at" ON "public"."tenants" USING "btree" ("deleted_at") WHERE ("deleted_at" IS NOT NULL);



CREATE INDEX "idx_v2_tenants_owner_user_id" ON "public"."tenants" USING "btree" ("owner_user_id");



CREATE INDEX "otp_challenges_active_idx" ON "public"."otp_challenges" USING "btree" ("user_id", "expires_at" DESC) WHERE ("consumed_at" IS NULL);



CREATE INDEX "otp_challenges_consumed_at_idx" ON "public"."otp_challenges" USING "btree" ("consumed_at");



CREATE INDEX "otp_challenges_expires_at_idx" ON "public"."otp_challenges" USING "btree" ("expires_at");



CREATE UNIQUE INDEX "otp_challenges_one_active_per_user" ON "public"."otp_challenges" USING "btree" ("user_id") WHERE ("consumed_at" IS NULL);



CREATE INDEX "otp_challenges_user_id_idx" ON "public"."otp_challenges" USING "btree" ("user_id");



CREATE INDEX "otp_challenges_user_idx" ON "public"."otp_challenges" USING "btree" ("user_id");



CREATE INDEX "otp_session_verifications_user_id_idx" ON "public"."otp_session_verifications" USING "btree" ("user_id");



CREATE INDEX "otp_session_verifications_verified_at_idx" ON "public"."otp_session_verifications" USING "btree" ("verified_at");



CREATE UNIQUE INDEX "styles_one_system_per_tenant_uidx" ON "public"."styles" USING "btree" ("tenant_id") WHERE ("is_system" = true);



CREATE UNIQUE INDEX "tenant_memberships_invite_token_idx" ON "public"."tenant_memberships" USING "btree" ("invite_token") WHERE ("invite_token" IS NOT NULL);



CREATE UNIQUE INDEX "tenant_memberships_unique_owner_per_tenant" ON "public"."tenant_memberships" USING "btree" ("tenant_id") WHERE ("role" = 'owner'::"text");



CREATE UNIQUE INDEX "tenants_stripe_customer_id_key" ON "public"."tenants" USING "btree" ("stripe_customer_id") WHERE ("stripe_customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "tenants_stripe_subscription_id_key" ON "public"."tenants" USING "btree" ("stripe_subscription_id") WHERE ("stripe_subscription_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_ccp_parent" ON "public"."catalog_category_products" USING "btree" ("catalog_id", "category_id", "product_id") WHERE ("variant_product_id" IS NULL);



CREATE UNIQUE INDEX "uq_ccp_variant" ON "public"."catalog_category_products" USING "btree" ("catalog_id", "category_id", "product_id", "variant_product_id") WHERE ("variant_product_id" IS NOT NULL);



CREATE UNIQUE INDEX "uq_platform_attr_code" ON "public"."product_attribute_definitions" USING "btree" ("code") WHERE ("tenant_id" IS NULL);



CREATE UNIQUE INDEX "uq_spo_schedule_product_no_value" ON "public"."schedule_price_overrides" USING "btree" ("schedule_id", "product_id") WHERE ("option_value_id" IS NULL);



CREATE UNIQUE INDEX "uq_spo_schedule_product_value" ON "public"."schedule_price_overrides" USING "btree" ("schedule_id", "product_id", "option_value_id") WHERE ("option_value_id" IS NOT NULL);



CREATE INDEX "v2_activity_group_members_activity_id_idx" ON "public"."activity_group_members" USING "btree" ("activity_id");



CREATE INDEX "v2_activity_group_members_group_id_idx" ON "public"."activity_group_members" USING "btree" ("group_id");



CREATE INDEX "v2_activity_groups_tenant_id_idx" ON "public"."activity_groups" USING "btree" ("tenant_id");



CREATE INDEX "v2_audit_events_created_at_idx" ON "public"."v2_audit_events" USING "btree" ("created_at" DESC);



CREATE INDEX "v2_ingredients_tenant_id_idx" ON "public"."ingredients" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "v2_ingredients_tenant_id_lower_name_key" ON "public"."ingredients" USING "btree" ("tenant_id", "lower"("name"));



CREATE INDEX "v2_invite_token_idx" ON "public"."tenant_memberships" USING "btree" ("invite_token") WHERE ("invite_token" IS NOT NULL);



CREATE INDEX "v2_notifications_user_type_idx" ON "public"."v2_notifications" USING "btree" ("user_id", "type", "created_at" DESC);



CREATE INDEX "v2_notifications_user_unread_idx" ON "public"."v2_notifications" USING "btree" ("user_id", "created_at" DESC) WHERE ("read_at" IS NULL);



CREATE INDEX "v2_product_ingredients_product_id_idx" ON "public"."product_ingredients" USING "btree" ("product_id");



CREATE INDEX "v2_product_ingredients_tenant_id_idx" ON "public"."product_ingredients" USING "btree" ("tenant_id");



CREATE INDEX "v2_schedule_layout_schedule_id_idx" ON "public"."schedule_layout" USING "btree" ("schedule_id");



CREATE INDEX "v2_schedule_price_overrides_product_id_idx" ON "public"."schedule_price_overrides" USING "btree" ("product_id");



CREATE INDEX "v2_schedule_price_overrides_schedule_id_idx" ON "public"."schedule_price_overrides" USING "btree" ("schedule_id");



CREATE INDEX "v2_schedule_targets_schedule_id_idx" ON "public"."schedule_targets" USING "btree" ("schedule_id");



CREATE UNIQUE INDEX "v2_schedule_targets_unique_idx" ON "public"."schedule_targets" USING "btree" ("schedule_id", "target_type", "target_id");



CREATE INDEX "v2_schedule_visibility_overrides_product_id_idx" ON "public"."schedule_visibility_overrides" USING "btree" ("product_id");



CREATE INDEX "v2_schedule_visibility_overrides_schedule_id_idx" ON "public"."schedule_visibility_overrides" USING "btree" ("schedule_id");



CREATE INDEX "v2_schedules_enabled_idx" ON "public"."schedules" USING "btree" ("enabled");



CREATE INDEX "v2_schedules_priority_idx" ON "public"."schedules" USING "btree" ("priority");



CREATE INDEX "v2_schedules_rule_type_idx" ON "public"."schedules" USING "btree" ("rule_type");



CREATE INDEX "v2_schedules_target_idx" ON "public"."schedules" USING "btree" ("target_type", "target_id");



CREATE INDEX "v2_schedules_tenant_id_idx" ON "public"."schedules" USING "btree" ("tenant_id");



CREATE INDEX "v2_style_versions_style_id_idx" ON "public"."style_versions" USING "btree" ("style_id");



CREATE INDEX "v2_style_versions_tenant_id_idx" ON "public"."style_versions" USING "btree" ("tenant_id");



CREATE INDEX "v2_styles_is_active_idx" ON "public"."styles" USING "btree" ("is_active");



CREATE INDEX "v2_styles_tenant_id_idx" ON "public"."styles" USING "btree" ("tenant_id");



CREATE INDEX "v2_tenant_memberships_pending_idx" ON "public"."tenant_memberships" USING "btree" ("tenant_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "v2_tenant_memberships_tenant_id_idx" ON "public"."tenant_memberships" USING "btree" ("tenant_id");



CREATE UNIQUE INDEX "v2_tenant_memberships_tenant_id_user_id_key" ON "public"."tenant_memberships" USING "btree" ("tenant_id", "user_id");



CREATE UNIQUE INDEX "v2_tenant_memberships_unique_pending" ON "public"."tenant_memberships" USING "btree" ("tenant_id", "user_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "v2_tenant_memberships_user_id_idx" ON "public"."tenant_memberships" USING "btree" ("user_id");



CREATE INDEX "v2_tenant_memberships_user_status_tenant_id_idx" ON "public"."tenant_memberships" USING "btree" ("user_id", "status", "tenant_id");



CREATE UNIQUE INDEX "v2_unique_pending_invites" ON "public"."tenant_memberships" USING "btree" ("tenant_id", "lower"("invited_email")) WHERE (("status" = 'pending'::"text") AND ("invited_email" IS NOT NULL));



CREATE OR REPLACE TRIGGER "check_product_group_depth_trigger" BEFORE INSERT OR UPDATE ON "public"."product_groups" FOR EACH ROW EXECUTE FUNCTION "public"."trg_check_product_group_depth"();



CREATE OR REPLACE TRIGGER "check_product_group_items_tenant_trigger" BEFORE INSERT OR UPDATE ON "public"."product_group_items" FOR EACH ROW EXECUTE FUNCTION "public"."trg_check_product_group_items_tenant"();



CREATE OR REPLACE TRIGGER "check_product_variant_trigger" BEFORE INSERT OR UPDATE ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."trg_check_product_variant"();



CREATE OR REPLACE TRIGGER "check_variant_assignment_trigger" BEFORE INSERT OR UPDATE ON "public"."product_variant_assignments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_check_variant_assignment"();



CREATE OR REPLACE TRIGGER "on_tenant_created" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_tenant_membership"();



CREATE OR REPLACE TRIGGER "on_tenant_created_system_group" AFTER INSERT ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_tenant_system_group"();



CREATE OR REPLACE TRIGGER "product_groups_set_updated_at" BEFORE UPDATE ON "public"."product_groups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "profiles_set_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_product_groups_updated_at" BEFORE UPDATE ON "public"."product_groups" FOR EACH ROW EXECUTE FUNCTION "public"."trg_product_groups_updated_at"();



CREATE OR REPLACE TRIGGER "tenant_memberships_set_updated_at" BEFORE UPDATE ON "public"."tenant_memberships" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_enforce_seat_limit" BEFORE INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_seat_limit"();



CREATE OR REPLACE TRIGGER "trg_featured_contents_updated_at" BEFORE UPDATE ON "public"."featured_contents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_delete_system_styles" BEFORE DELETE ON "public"."styles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_delete_system_styles"();



CREATE OR REPLACE TRIGGER "trg_protect_tenant_deleted_at" BEFORE UPDATE ON "public"."tenants" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_deleted_at_client_update"();



CREATE OR REPLACE TRIGGER "trg_validate_ccp_variant_parent" BEFORE INSERT OR UPDATE ON "public"."catalog_category_products" FOR EACH ROW EXECUTE FUNCTION "public"."validate_ccp_variant_parent"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."activity_group_members"
    ADD CONSTRAINT "activity_group_members_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_group_members"
    ADD CONSTRAINT "activity_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."activity_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_group_members"
    ADD CONSTRAINT "activity_group_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_groups"
    ADD CONSTRAINT "activity_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_hours"
    ADD CONSTRAINT "activity_hours_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_hours"
    ADD CONSTRAINT "activity_hours_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_media"
    ADD CONSTRAINT "activity_media_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_product_overrides"
    ADD CONSTRAINT "activity_product_overrides_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_product_overrides"
    ADD CONSTRAINT "activity_product_overrides_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id");



ALTER TABLE ONLY "public"."analytics_events"
    ADD CONSTRAINT "analytics_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."catalog_categories"
    ADD CONSTRAINT "catalog_categories_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_categories"
    ADD CONSTRAINT "catalog_categories_parent_category_id_fkey" FOREIGN KEY ("parent_category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_categories"
    ADD CONSTRAINT "catalog_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "catalog_category_products_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "catalog_category_products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."catalog_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "catalog_category_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "catalog_category_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_category_products"
    ADD CONSTRAINT "catalog_category_products_variant_product_id_fkey" FOREIGN KEY ("variant_product_id") REFERENCES "public"."products"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_items"
    ADD CONSTRAINT "catalog_items_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."catalog_sections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalog_sections"
    ADD CONSTRAINT "catalog_sections_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."catalogs"
    ADD CONSTRAINT "catalogs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."featured_content_products"
    ADD CONSTRAINT "featured_content_products_featured_content_id_fkey" FOREIGN KEY ("featured_content_id") REFERENCES "public"."featured_contents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."featured_content_products"
    ADD CONSTRAINT "featured_content_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."featured_content_products"
    ADD CONSTRAINT "featured_content_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."featured_contents"
    ADD CONSTRAINT "featured_contents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."otp_challenges"
    ADD CONSTRAINT "otp_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."otp_session_verifications"
    ADD CONSTRAINT "otp_session_verifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_allergen_id_fkey" FOREIGN KEY ("allergen_id") REFERENCES "public"."allergens"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_allergens"
    ADD CONSTRAINT "product_allergens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_attribute_definitions"
    ADD CONSTRAINT "product_attribute_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "product_attribute_values_attribute_definition_id_fkey" FOREIGN KEY ("attribute_definition_id") REFERENCES "public"."product_attribute_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "product_attribute_values_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_attribute_values"
    ADD CONSTRAINT "product_attribute_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_group_items"
    ADD CONSTRAINT "product_group_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."product_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_group_items"
    ADD CONSTRAINT "product_group_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_group_items"
    ADD CONSTRAINT "product_group_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_parent_group_id_fkey" FOREIGN KEY ("parent_group_id") REFERENCES "public"."product_groups"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."product_groups"
    ADD CONSTRAINT "product_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_ingredients"
    ADD CONSTRAINT "product_ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "product_option_groups_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_option_groups"
    ADD CONSTRAINT "product_option_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_option_values"
    ADD CONSTRAINT "product_option_values_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "public"."product_option_groups"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_option_values"
    ADD CONSTRAINT "product_option_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_assignment_values"
    ADD CONSTRAINT "product_variant_assignment_values_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."product_variant_assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_assignment_values"
    ADD CONSTRAINT "product_variant_assignment_values_dimension_value_id_fkey" FOREIGN KEY ("dimension_value_id") REFERENCES "public"."product_variant_dimension_values"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_assignments"
    ADD CONSTRAINT "product_variant_assignments_variant_product_id_fkey" FOREIGN KEY ("variant_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_dimension_values"
    ADD CONSTRAINT "product_variant_dimension_values_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "public"."product_variant_dimensions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_dimension_values"
    ADD CONSTRAINT "product_variant_dimension_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_dimensions"
    ADD CONSTRAINT "product_variant_dimensions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."product_variant_dimensions"
    ADD CONSTRAINT "product_variant_dimensions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_featured_contents"
    ADD CONSTRAINT "schedule_featured_contents_featured_content_id_fkey" FOREIGN KEY ("featured_content_id") REFERENCES "public"."featured_contents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_featured_contents"
    ADD CONSTRAINT "schedule_featured_contents_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_featured_contents"
    ADD CONSTRAINT "schedule_featured_contents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."schedule_layout"
    ADD CONSTRAINT "schedule_layout_catalog_id_fkey" FOREIGN KEY ("catalog_id") REFERENCES "public"."catalogs"("id");



ALTER TABLE ONLY "public"."schedule_layout"
    ADD CONSTRAINT "schedule_layout_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_layout"
    ADD CONSTRAINT "schedule_layout_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id");



ALTER TABLE ONLY "public"."schedule_price_overrides"
    ADD CONSTRAINT "schedule_price_overrides_option_value_id_fkey" FOREIGN KEY ("option_value_id") REFERENCES "public"."product_option_values"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_price_overrides"
    ADD CONSTRAINT "schedule_price_overrides_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_price_overrides"
    ADD CONSTRAINT "schedule_price_overrides_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_targets"
    ADD CONSTRAINT "schedule_targets_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_visibility_overrides"
    ADD CONSTRAINT "schedule_visibility_overrides_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_visibility_overrides"
    ADD CONSTRAINT "schedule_visibility_overrides_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."style_versions"
    ADD CONSTRAINT "style_versions_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "public"."styles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."style_versions"
    ADD CONSTRAINT "style_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."styles"
    ADD CONSTRAINT "styles_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "public"."style_versions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."styles"
    ADD CONSTRAINT "styles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_memberships"
    ADD CONSTRAINT "tenant_memberships_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_plan_fkey" FOREIGN KEY ("plan") REFERENCES "public"."plans"("code");



ALTER TABLE ONLY "public"."v2_audit_events"
    ADD CONSTRAINT "v2_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."v2_audit_events"
    ADD CONSTRAINT "v2_audit_events_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."v2_audit_events"
    ADD CONSTRAINT "v2_audit_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."v2_notifications"
    ADD CONSTRAINT "v2_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."v2_notifications"
    ADD CONSTRAINT "v2_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Active members can read memberships" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tenants" "t"
  WHERE (("t"."id" = "tenant_memberships"."tenant_id") AND ("t"."owner_user_id" = "auth"."uid"())))));



CREATE POLICY "Active members can read team memberships" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Public can read activities" ON "public"."activities" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read activity_group_members" ON "public"."activity_group_members" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read activity_groups" ON "public"."activity_groups" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read ingredients" ON "public"."ingredients" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Public can read product_allergens" ON "public"."product_allergens" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Public can read product_attribute_definitions" ON "public"."product_attribute_definitions" FOR SELECT USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids"))));



CREATE POLICY "Public can read product_attribute_values" ON "public"."product_attribute_values" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read product_ingredients" ON "public"."product_ingredients" FOR SELECT TO "anon" USING (true);



CREATE POLICY "Public can read product_variant_assignment_values" ON "public"."product_variant_assignment_values" FOR SELECT USING (("assignment_id" IN ( SELECT "product_variant_assignments"."id"
   FROM "public"."product_variant_assignments"
  WHERE ("product_variant_assignments"."tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")))));



CREATE POLICY "Public can read product_variant_assignments" ON "public"."product_variant_assignments" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read product_variant_dimension_values" ON "public"."product_variant_dimension_values" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read product_variant_dimensions" ON "public"."product_variant_dimensions" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read products" ON "public"."products" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read schedule_visibility_overrides" ON "public"."schedule_visibility_overrides" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_public_tenant_ids"() AS "get_public_tenant_ids")));



CREATE POLICY "Public can read v2_allergens" ON "public"."allergens" FOR SELECT USING (true);



CREATE POLICY "Service role has full access to attribute definitions" ON "public"."product_attribute_definitions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to attribute values" ON "public"."product_attribute_values" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to catalog categories" ON "public"."catalog_categories" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to catalog category products" ON "public"."catalog_category_products" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to catalogs" ON "public"."catalogs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to product allergens" ON "public"."product_allergens" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to product group items" ON "public"."product_group_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to product groups" ON "public"."product_groups" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to product option groups" ON "public"."product_option_groups" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Service role has full access to product option values" ON "public"."product_option_values" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "Tenant can insert own tenants" ON "public"."tenants" FOR INSERT TO "authenticated" WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "Tenant can read own audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant can update own tenants" ON "public"."tenants" FOR UPDATE TO "authenticated" USING (("owner_user_id" = "auth"."uid"())) WITH CHECK (("owner_user_id" = "auth"."uid"()));



CREATE POLICY "Tenant delete own products" ON "public"."products" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."activities" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."activity_group_members" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."activity_groups" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."analytics_events" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."catalog_categories" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."catalog_category_products" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."catalog_items" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."catalog_sections" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."catalogs" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."featured_content_products" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."featured_contents" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."ingredients" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_allergens" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_attribute_definitions" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_attribute_values" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_group_items" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_groups" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_ingredients" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_option_groups" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_option_values" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_variant_assignment_values" FOR DELETE TO "authenticated" USING (("assignment_id" IN ( SELECT "product_variant_assignments"."id"
   FROM "public"."product_variant_assignments"
  WHERE ("product_variant_assignments"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant delete own rows" ON "public"."product_variant_assignments" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_variant_dimension_values" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."product_variant_dimensions" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."schedule_featured_contents" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."schedule_layout" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."schedule_price_overrides" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."schedule_visibility_overrides" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."schedules" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."style_versions" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own rows" ON "public"."styles" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant delete own schedule targets" ON "public"."schedule_targets" FOR DELETE TO "authenticated" USING (("schedule_id" IN ( SELECT "schedules"."id"
   FROM "public"."schedules"
  WHERE ("schedules"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant insert own products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."activity_group_members" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."activity_groups" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."analytics_events" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."catalog_categories" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."catalog_category_products" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."catalog_items" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."catalog_sections" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."catalogs" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."featured_content_products" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."featured_contents" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."ingredients" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_allergens" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_attribute_definitions" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_attribute_values" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_group_items" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_groups" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_ingredients" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_option_groups" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_option_values" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_variant_assignment_values" FOR INSERT TO "authenticated" WITH CHECK (("assignment_id" IN ( SELECT "product_variant_assignments"."id"
   FROM "public"."product_variant_assignments"
  WHERE ("product_variant_assignments"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant insert own rows" ON "public"."product_variant_assignments" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_variant_dimension_values" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."product_variant_dimensions" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."schedule_featured_contents" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."schedule_layout" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."schedule_price_overrides" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."schedule_visibility_overrides" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."schedules" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."style_versions" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own rows" ON "public"."styles" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant insert own schedule targets" ON "public"."schedule_targets" FOR INSERT TO "authenticated" WITH CHECK (("schedule_id" IN ( SELECT "schedules"."id"
   FROM "public"."schedules"
  WHERE ("schedules"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant owner can manage memberships" ON "public"."tenant_memberships" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."tenants" "t"
  WHERE (("t"."id" = "tenant_memberships"."tenant_id") AND ("t"."owner_user_id" = "auth"."uid"()) AND ("t"."deleted_at" IS NULL))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."tenants" "t"
  WHERE (("t"."id" = "tenant_memberships"."tenant_id") AND ("t"."owner_user_id" = "auth"."uid"()) AND ("t"."deleted_at" IS NULL)))));



CREATE POLICY "Tenant select own products" ON "public"."products" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."activities" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."activity_group_members" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."activity_groups" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."analytics_events" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."catalog_categories" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."catalog_category_products" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."catalog_items" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."catalog_sections" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."catalogs" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."featured_content_products" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."featured_contents" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."ingredients" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_allergens" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_attribute_definitions" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) OR ("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))));



CREATE POLICY "Tenant select own rows" ON "public"."product_attribute_values" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_group_items" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_groups" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_ingredients" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_option_groups" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_option_values" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_variant_assignment_values" FOR SELECT TO "authenticated" USING (("assignment_id" IN ( SELECT "product_variant_assignments"."id"
   FROM "public"."product_variant_assignments"
  WHERE ("product_variant_assignments"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant select own rows" ON "public"."product_variant_assignments" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_variant_dimension_values" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."product_variant_dimensions" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."schedule_featured_contents" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."schedule_layout" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."schedule_price_overrides" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."schedule_visibility_overrides" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."schedules" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."style_versions" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own rows" ON "public"."styles" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant select own schedule targets" ON "public"."schedule_targets" FOR SELECT TO "authenticated" USING (("schedule_id" IN ( SELECT "schedules"."id"
   FROM "public"."schedules"
  WHERE ("schedules"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenant update own products" ON "public"."products" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."activities" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."activity_group_members" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."activity_groups" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."analytics_events" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."catalog_categories" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."catalog_category_products" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."catalog_items" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."catalog_sections" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."catalogs" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."featured_content_products" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."featured_contents" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."ingredients" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_allergens" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_attribute_definitions" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_attribute_values" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_group_items" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_groups" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_ingredients" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_option_groups" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_option_values" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_variant_assignments" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_variant_dimension_values" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."product_variant_dimensions" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."schedule_featured_contents" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."schedule_layout" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."schedule_price_overrides" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."schedule_visibility_overrides" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."schedules" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."style_versions" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own rows" ON "public"."styles" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenant update own schedule targets" ON "public"."schedule_targets" FOR UPDATE TO "authenticated" USING (("schedule_id" IN ( SELECT "schedules"."id"
   FROM "public"."schedules"
  WHERE ("schedules"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))) WITH CHECK (("schedule_id" IN ( SELECT "schedules"."id"
   FROM "public"."schedules"
  WHERE ("schedules"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "Tenants can delete their own product allergens" ON "public"."product_allergens" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenants can insert their own product allergens" ON "public"."product_allergens" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenants can select their own product allergens" ON "public"."product_allergens" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "Tenants can update their own product allergens" ON "public"."product_allergens" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))) WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "User can read own orphan audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ((("tenant_id" IS NULL) AND ("user_id" = "auth"."uid"())));



CREATE POLICY "Users can delete own notifications" ON "public"."v2_notifications" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can mark own notifications as read" ON "public"."v2_notifications" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read own memberships or invites" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING ((("user_id" = "auth"."uid"()) OR ("invited_email" = "auth"."email"())));



CREATE POLICY "Users can read own notifications" ON "public"."v2_notifications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read pending invites for their email" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING (("lower"("invited_email") = "lower"("auth"."email"())));



CREATE POLICY "Users can read their own membership" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can read their own pending email invites" ON "public"."tenant_memberships" FOR SELECT TO "authenticated" USING ((("status" = 'pending'::"text") AND ("lower"("invited_email") = "lower"("auth"."email"()))));



CREATE POLICY "Users can read their tenants" ON "public"."tenants" FOR SELECT TO "authenticated" USING (((("owner_user_id" = "auth"."uid"()) AND ("deleted_at" IS NULL)) OR ("id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_group_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_hours" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_media" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "activity_media_tenant_delete" ON "public"."activity_media" FOR DELETE USING (("activity_id" IN ( SELECT "activities"."id"
   FROM "public"."activities"
  WHERE ("activities"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "activity_media_tenant_insert" ON "public"."activity_media" FOR INSERT WITH CHECK (("activity_id" IN ( SELECT "activities"."id"
   FROM "public"."activities"
  WHERE ("activities"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "activity_media_tenant_select" ON "public"."activity_media" FOR SELECT USING (("activity_id" IN ( SELECT "activities"."id"
   FROM "public"."activities"
  WHERE ("activities"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



CREATE POLICY "activity_media_tenant_update" ON "public"."activity_media" FOR UPDATE USING (("activity_id" IN ( SELECT "activities"."id"
   FROM "public"."activities"
  WHERE ("activities"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))) WITH CHECK (("activity_id" IN ( SELECT "activities"."id"
   FROM "public"."activities"
  WHERE ("activities"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))));



ALTER TABLE "public"."activity_product_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."allergens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_category_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalog_sections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."catalogs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete_activity_hours" ON "public"."activity_hours" FOR DELETE USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



ALTER TABLE "public"."featured_content_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."featured_contents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert_activity_hours" ON "public"."activity_hours" FOR INSERT WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



ALTER TABLE "public"."otp_challenges" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."otp_session_verifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "otp_session_verifications_delete_owner" ON "public"."otp_session_verifications" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "otp_session_verifications_select_owner" ON "public"."otp_session_verifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "policy_activity_product_overrides_delete" ON "public"."activity_product_overrides" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_product_overrides"."activity_id") AND ("a"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));



CREATE POLICY "policy_activity_product_overrides_insert" ON "public"."activity_product_overrides" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_product_overrides"."activity_id") AND ("a"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));



CREATE POLICY "policy_activity_product_overrides_select" ON "public"."activity_product_overrides" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_product_overrides"."activity_id") AND ("a"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));



CREATE POLICY "policy_activity_product_overrides_update" ON "public"."activity_product_overrides" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_product_overrides"."activity_id") AND ("a"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."activities" "a"
  WHERE (("a"."id" = "activity_product_overrides"."activity_id") AND ("a"."tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids"))))));



ALTER TABLE "public"."product_allergens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attribute_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_attribute_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_group_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_ingredients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_option_groups" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_option_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variant_assignment_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variant_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variant_dimension_values" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."product_variant_dimensions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_owner" ON "public"."profiles" FOR INSERT WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_select_self_or_tenant_member" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM ("public"."tenant_memberships" "tm_self"
     JOIN "public"."tenant_memberships" "tm_target" ON (("tm_target"."tenant_id" = "tm_self"."tenant_id")))
  WHERE (("tm_self"."user_id" = "auth"."uid"()) AND ("tm_target"."user_id" = "profiles"."id") AND ("tm_self"."status" = 'active'::"text") AND ("tm_target"."status" = 'active'::"text"))))));



CREATE POLICY "profiles_update_owner" ON "public"."profiles" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."qr_scans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reviews_delete_authenticated" ON "public"."reviews" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "reviews_insert_anon" ON "public"."reviews" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "reviews_insert_authenticated" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "reviews_select_anon" ON "public"."reviews" FOR SELECT TO "anon" USING (("status" = 'approved'::"text"));



CREATE POLICY "reviews_select_authenticated" ON "public"."reviews" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



CREATE POLICY "reviews_update_authenticated" ON "public"."reviews" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



ALTER TABLE "public"."schedule_featured_contents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_layout" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_price_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_targets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_visibility_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "select_activity_hours" ON "public"."activity_hours" FOR SELECT USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



ALTER TABLE "public"."style_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."styles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_memberships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update_activity_hours" ON "public"."activity_hours" FOR UPDATE USING (("tenant_id" IN ( SELECT "public"."get_my_tenant_ids"() AS "get_my_tenant_ids")));



ALTER TABLE "public"."v2_audit_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."v2_notifications" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."v2_notifications";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

















































































































































































REVOKE ALL ON FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_invite_by_token"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."accept_tenant_invite"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_device_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_device_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_device_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_hourly_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_hourly_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_hourly_distribution"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_overview_stats"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_overview_stats"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_overview_stats"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_page_views_trend"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_granularity" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_page_views_trend"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_granularity" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_page_views_trend"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_granularity" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_review_metrics"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_review_metrics"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_review_metrics"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_search_rate"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_search_rate"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_search_rate"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_social_clicks"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_social_clicks"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_social_clicks"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_top_selected_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_top_selected_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_top_selected_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."analytics_top_viewed_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."analytics_top_viewed_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."analytics_top_viewed_products"("p_tenant_id" "uuid", "p_from" timestamp with time zone, "p_to" timestamp with time zone, "p_activity_id" "uuid", "p_limit" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."change_member_role"("p_tenant_id" "uuid", "p_user_id" "uuid", "p_role" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_account_deleted"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."decline_invite_by_token"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."delete_invite"("p_membership_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."delete_invite"("p_membership_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_invite"("p_membership_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_invite"("p_membership_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_seat_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_seat_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_seat_limit"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_account_deletion_tenant_ops"("p_actions" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."expire_old_invites"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."expire_old_invites"() TO "anon";
GRANT ALL ON FUNCTION "public"."expire_old_invites"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."expire_old_invites"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_invite_info_by_token"("p_token" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_deleted_tenants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_deleted_tenants"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_my_deleted_tenants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_deleted_tenants"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_my_tenant_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_my_tenant_ids"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_catalog"("p_catalog_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_tenant_ids"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_schedule_featured_contents"("p_schedule_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_schedule_featured_contents"("p_schedule_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_schedule_featured_contents"("p_schedule_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_public_info"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_id_by_email"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_tenants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_tenants"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenants"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_tenant_membership"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_membership"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_membership"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_tenant_system_group"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_system_group"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_tenant_system_group"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."increment_otp_attempt"("challenge_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."increment_otp_attempt"("challenge_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."increment_otp_attempt"("challenge_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."invite_tenant_member"("p_tenant_id" "uuid", "p_email" "text", "p_role" "text") TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON FUNCTION "public"."is_schedule_active"("s" "public"."schedules") TO "anon";
GRANT ALL ON FUNCTION "public"."is_schedule_active"("s" "public"."schedules") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_schedule_active"("s" "public"."schedules") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_schedule_active_now"("days" smallint[], "start_t" time without time zone, "end_t" time without time zone, "tz" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."is_schedule_active_now"("days" smallint[], "start_t" time without time zone, "end_t" time without time zone, "tz" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_schedule_active_now"("days" smallint[], "start_t" time without time zone, "end_t" time without time zone, "tz" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."leave_tenant"("p_tenant_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_account_deleted"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_delete_system_styles"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_delete_system_styles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_delete_system_styles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_deleted_at_client_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_deleted_at_client_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_deleted_at_client_update"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_locked_expired_tenants"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_locked_expired_tenants"() TO "anon";
GRANT ALL ON FUNCTION "public"."purge_locked_expired_tenants"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_locked_expired_tenants"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."purge_user_data"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."purge_user_data"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."purge_user_data"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."purge_user_data"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_tenant_member"("p_tenant_id" "uuid", "p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."resend_invite"("p_membership_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resend_invite"("p_membership_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resend_invite"("p_membership_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resend_invite"("p_membership_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."revoke_invite"("p_membership_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."simple_slug"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."simple_slug"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."simple_slug"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_profile_email"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_ownership"("p_tenant_id" "uuid", "p_new_owner_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_check_product_group_depth"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_check_product_group_depth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_check_product_group_depth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_check_product_group_items_tenant"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_check_product_group_items_tenant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_check_product_group_items_tenant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_check_product_variant"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_check_product_variant"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_check_product_variant"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_check_variant_assignment"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_check_variant_assignment"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_check_variant_assignment"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_product_groups_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_product_groups_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_product_groups_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."unlock_owned_tenants"("p_user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_tenant_logo"("p_tenant_id" "uuid", "p_logo_url" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_ccp_variant_parent"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_ccp_variant_parent"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_ccp_variant_parent"() TO "service_role";
























GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."activity_group_members" TO "anon";
GRANT ALL ON TABLE "public"."activity_group_members" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_group_members" TO "service_role";



GRANT ALL ON TABLE "public"."activity_groups" TO "anon";
GRANT ALL ON TABLE "public"."activity_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_groups" TO "service_role";



GRANT ALL ON TABLE "public"."activity_hours" TO "anon";
GRANT ALL ON TABLE "public"."activity_hours" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_hours" TO "service_role";



GRANT ALL ON TABLE "public"."activity_media" TO "anon";
GRANT ALL ON TABLE "public"."activity_media" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_media" TO "service_role";



GRANT ALL ON TABLE "public"."activity_product_overrides" TO "anon";
GRANT ALL ON TABLE "public"."activity_product_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_product_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."allergens" TO "anon";
GRANT ALL ON TABLE "public"."allergens" TO "authenticated";
GRANT ALL ON TABLE "public"."allergens" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_events" TO "anon";
GRANT ALL ON TABLE "public"."analytics_events" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_events" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_categories" TO "anon";
GRANT ALL ON TABLE "public"."catalog_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_categories" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_category_products" TO "anon";
GRANT ALL ON TABLE "public"."catalog_category_products" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_category_products" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_items" TO "anon";
GRANT ALL ON TABLE "public"."catalog_items" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_items" TO "service_role";



GRANT ALL ON TABLE "public"."catalog_sections" TO "anon";
GRANT ALL ON TABLE "public"."catalog_sections" TO "authenticated";
GRANT ALL ON TABLE "public"."catalog_sections" TO "service_role";



GRANT ALL ON TABLE "public"."catalogs" TO "anon";
GRANT ALL ON TABLE "public"."catalogs" TO "authenticated";
GRANT ALL ON TABLE "public"."catalogs" TO "service_role";



GRANT ALL ON TABLE "public"."featured_content_products" TO "anon";
GRANT ALL ON TABLE "public"."featured_content_products" TO "authenticated";
GRANT ALL ON TABLE "public"."featured_content_products" TO "service_role";



GRANT ALL ON TABLE "public"."featured_contents" TO "anon";
GRANT ALL ON TABLE "public"."featured_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."featured_contents" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_memberships" TO "anon";
GRANT ALL ON TABLE "public"."tenant_memberships" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_memberships" TO "service_role";



GRANT ALL ON TABLE "public"."my_pending_invites_view" TO "anon";
GRANT ALL ON TABLE "public"."my_pending_invites_view" TO "authenticated";
GRANT ALL ON TABLE "public"."my_pending_invites_view" TO "service_role";



GRANT ALL ON TABLE "public"."otp_challenges" TO "anon";
GRANT ALL ON TABLE "public"."otp_challenges" TO "authenticated";
GRANT ALL ON TABLE "public"."otp_challenges" TO "service_role";



GRANT ALL ON TABLE "public"."otp_session_verifications" TO "anon";
GRANT ALL ON TABLE "public"."otp_session_verifications" TO "authenticated";
GRANT ALL ON TABLE "public"."otp_session_verifications" TO "service_role";



GRANT ALL ON TABLE "public"."plans" TO "anon";
GRANT ALL ON TABLE "public"."plans" TO "authenticated";
GRANT ALL ON TABLE "public"."plans" TO "service_role";



GRANT ALL ON TABLE "public"."product_allergens" TO "anon";
GRANT ALL ON TABLE "public"."product_allergens" TO "authenticated";
GRANT ALL ON TABLE "public"."product_allergens" TO "service_role";



GRANT ALL ON TABLE "public"."product_attribute_definitions" TO "anon";
GRANT ALL ON TABLE "public"."product_attribute_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attribute_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."product_attribute_values" TO "anon";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_attribute_values" TO "service_role";



GRANT ALL ON TABLE "public"."product_group_items" TO "anon";
GRANT ALL ON TABLE "public"."product_group_items" TO "authenticated";
GRANT ALL ON TABLE "public"."product_group_items" TO "service_role";



GRANT ALL ON TABLE "public"."product_groups" TO "anon";
GRANT ALL ON TABLE "public"."product_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."product_groups" TO "service_role";



GRANT ALL ON TABLE "public"."product_ingredients" TO "anon";
GRANT ALL ON TABLE "public"."product_ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."product_ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."product_option_groups" TO "anon";
GRANT ALL ON TABLE "public"."product_option_groups" TO "authenticated";
GRANT ALL ON TABLE "public"."product_option_groups" TO "service_role";



GRANT ALL ON TABLE "public"."product_option_values" TO "anon";
GRANT ALL ON TABLE "public"."product_option_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_option_values" TO "service_role";



GRANT ALL ON TABLE "public"."product_variant_assignment_values" TO "anon";
GRANT ALL ON TABLE "public"."product_variant_assignment_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variant_assignment_values" TO "service_role";



GRANT ALL ON TABLE "public"."product_variant_assignments" TO "anon";
GRANT ALL ON TABLE "public"."product_variant_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variant_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."product_variant_dimension_values" TO "anon";
GRANT ALL ON TABLE "public"."product_variant_dimension_values" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variant_dimension_values" TO "service_role";



GRANT ALL ON TABLE "public"."product_variant_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."product_variant_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."product_variant_dimensions" TO "service_role";



GRANT ALL ON TABLE "public"."products" TO "anon";
GRANT ALL ON TABLE "public"."products" TO "authenticated";
GRANT ALL ON TABLE "public"."products" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."qr_scans" TO "anon";
GRANT ALL ON TABLE "public"."qr_scans" TO "authenticated";
GRANT ALL ON TABLE "public"."qr_scans" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_featured_contents" TO "anon";
GRANT ALL ON TABLE "public"."schedule_featured_contents" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_featured_contents" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_layout" TO "anon";
GRANT ALL ON TABLE "public"."schedule_layout" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_layout" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_price_overrides" TO "anon";
GRANT ALL ON TABLE "public"."schedule_price_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_price_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_targets" TO "anon";
GRANT ALL ON TABLE "public"."schedule_targets" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_targets" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_visibility_overrides" TO "anon";
GRANT ALL ON TABLE "public"."schedule_visibility_overrides" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_visibility_overrides" TO "service_role";



GRANT ALL ON TABLE "public"."style_versions" TO "anon";
GRANT ALL ON TABLE "public"."style_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."style_versions" TO "service_role";



GRANT ALL ON TABLE "public"."styles" TO "anon";
GRANT ALL ON TABLE "public"."styles" TO "authenticated";
GRANT ALL ON TABLE "public"."styles" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_members_view" TO "anon";
GRANT ALL ON TABLE "public"."tenant_members_view" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_members_view" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."user_tenants_view" TO "anon";
GRANT ALL ON TABLE "public"."user_tenants_view" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tenants_view" TO "service_role";



GRANT ALL ON TABLE "public"."v2_audit_events" TO "anon";
GRANT ALL ON TABLE "public"."v2_audit_events" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_audit_events" TO "service_role";



GRANT ALL ON TABLE "public"."v2_notifications" TO "anon";
GRANT ALL ON TABLE "public"."v2_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."v2_notifications" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































A new version of Supabase CLI is available: v2.90.0 (currently installed v2.78.1)
We recommend updating regularly for new features and bug fixes: https://supabase.com/docs/guides/cli/getting-started#updating-the-supabase-cli
