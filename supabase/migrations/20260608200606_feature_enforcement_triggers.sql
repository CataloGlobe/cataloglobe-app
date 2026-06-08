BEGIN;

-- =============================================================================
-- Feature enforcement triggers (Base/Pro gating backstop) — write-guard only
-- =============================================================================
--
-- Server-side enforcement of the plan-based feature gating on the two
-- customer write paths: a new row in `orders` requires the activity's plan
-- to include `table_ordering`; a new row in `reservations` requires
-- `table_reservation`. UI-side gating (sidebar, pages, settings toggles)
-- stays best-effort UX; this migration is the non-bypassable backstop for
-- the actual creation of records.
--
-- Source of truth: public.activity_has_feature(p_activity_id, p_feature_id)
--   - SECURITY INVOKER, STABLE, sql
--   - returns boolean, NULL if the activity does not exist
--   - already honours activities.plan_override over tenants.plan
--
-- Fail-closed semantics: we use `IS NOT TRUE` so a NULL return (missing
-- activity, missing plan row, missing feature key) blocks the operation.
--
-- The trigger functions are SECURITY DEFINER so they can read public.tenants
-- and public.plans regardless of the caller's RLS context. They themselves
-- do not need EXECUTE granted to any role (triggers are invoked by the
-- system, not via SQL EXECUTE).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: a third guard on `public.activities` (ordering_enabled /
-- enable_reservations flag transitions) is intentionally NOT included here.
-- It belongs in a dedicated migration shipped together with:
--   1) ALTER TABLE public.activities ALTER COLUMN ordering_enabled
--      SET DEFAULT false; and the matching call-site updates so creating a
--      Base-tenant activity does not raise on the default true; and
--   2) the public-page display gate that hides the QR-ordering / reservation
--      surface when the feature is not in the plan.
-- This file ships only the two unambiguous write guards.
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. orders — BEFORE INSERT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_feature_table_ordering_on_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF public.activity_has_feature(NEW.activity_id, 'table_ordering') IS NOT TRUE THEN
        RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE: table_ordering'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_enforce_feature_table_ordering ON public.orders;
CREATE TRIGGER orders_enforce_feature_table_ordering
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_feature_table_ordering_on_orders();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reservations — BEFORE INSERT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_feature_table_reservation_on_reservations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    IF public.activity_has_feature(NEW.activity_id, 'table_reservation') IS NOT TRUE THEN
        RAISE EXCEPTION 'FEATURE_NOT_AVAILABLE: table_reservation'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reservations_enforce_feature_table_reservation ON public.reservations;
CREATE TRIGGER reservations_enforce_feature_table_reservation
    BEFORE INSERT ON public.reservations
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_feature_table_reservation_on_reservations();


-- ─────────────────────────────────────────────────────────────────────────────
-- Validation: confirm both triggers and both functions exist
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
    fn_count int;
    trg_count int;
BEGIN
    SELECT COUNT(*) INTO fn_count
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
          'enforce_feature_table_ordering_on_orders',
          'enforce_feature_table_reservation_on_reservations'
      );

    IF fn_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 trigger functions, found %', fn_count;
    END IF;

    SELECT COUNT(*) INTO trg_count
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND t.tgname IN (
          'orders_enforce_feature_table_ordering',
          'reservations_enforce_feature_table_reservation'
      );

    IF trg_count <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 triggers, found %', trg_count;
    END IF;

    RAISE NOTICE 'OK: 2 trigger functions + 2 triggers installed.';
END $$;

COMMIT;
