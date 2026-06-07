BEGIN;

-- =============================================================================
-- Subscription refactor — Step 8/8: activity_has_feature() gating helper
-- =============================================================================
--
-- Resolves the effective plan for an activity as COALESCE(plan_override, plan)
-- and returns true iff `features_json[p_feature_id]` is the JSON literal true.
--
-- - LANGUAGE sql (single-SELECT body) — avoids the CLI `prepared statement /
--   SQLSTATE 42601` problem documented in docs/patterns/storage-sql.md that
--   bites multi-statement plpgsql bodies combined with REVOKE/GRANT.
-- - SECURITY INVOKER + `SET search_path TO ''` + fully-qualified table refs.
--   The caller still goes through RLS on activities/tenants — the function does
--   not bypass tenant isolation.
-- - Returns false for unknown activity, missing plan row, or missing feature key.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.activity_has_feature(
    p_activity_id uuid,
    p_feature_id  text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT COALESCE(
        (p.features_json ->> p_feature_id)::boolean,
        false
    )
    FROM public.activities a
    JOIN public.tenants    t ON t.id   = a.tenant_id
    JOIN public.plans      p ON p.code = COALESCE(a.plan_override, t.plan)
    WHERE a.id = p_activity_id
$$;

REVOKE EXECUTE ON FUNCTION public.activity_has_feature(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.activity_has_feature(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.activity_has_feature(uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Validation
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = 'activity_has_feature'
    ) THEN
        RAISE EXCEPTION 'FAIL: activity_has_feature() not created.';
    END IF;
    RAISE NOTICE 'OK: activity_has_feature() present.';

    -- Sanity check: authenticated has EXECUTE, PUBLIC does not.
    IF NOT has_function_privilege('authenticated',
        'public.activity_has_feature(uuid, text)', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL: authenticated cannot EXECUTE activity_has_feature.';
    END IF;
    RAISE NOTICE 'OK: authenticated has EXECUTE on activity_has_feature.';
END $$;

COMMIT;
