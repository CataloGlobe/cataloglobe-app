-- Server-side (DB-level) verification gate. Fires on EVERY orders UPDATE,
-- including service_role transitions that bypass RLS => cannot be circumvented
-- by direct calls (FASE 2 review risk #1).
--   * submitted -> acknowledged : verifies the group (sets verified_at).
--   * -> ready / -> delivered on an unverified group : blocked (RAISE).
-- One statement, no BEGIN;/COMMIT; wrapper (db-push rule: dollar-quoted CREATE
-- FUNCTION must be alone; the trigger itself is created in 20260703101100).
CREATE OR REPLACE FUNCTION public.enforce_order_group_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_verified_at timestamptz;
    v_mode        text;
BEGIN
    -- Belt-and-suspenders: the trigger also carries a WHEN clause, but guard
    -- here too in case it is ever recreated without one.
    IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.order_group_id IS NULL THEN
        RETURN NEW;  -- defensive: orphan order, nothing to gate.
    END IF;

    SELECT og.verified_at INTO v_verified_at
      FROM public.order_groups og WHERE og.id = NEW.order_group_id;

    IF v_verified_at IS NOT NULL THEN
        RETURN NEW;  -- already verified, nothing to gate.
    END IF;

    -- Unverified group. If the activity runs in 'none' mode (no staff
    -- verification required), treat it as verified so a mid-service switch to
    -- 'none' does not leave a pre-existing open group stuck. New 'none' groups
    -- are created with verified_at already set, so this only catches groups
    -- created under 'first_order' before the mode change.
    SELECT a.ordering_verification_mode INTO v_mode
      FROM public.activities a WHERE a.id = NEW.activity_id;

    IF v_mode = 'none' THEN
        UPDATE public.order_groups
           SET verified_at = now(), updated_at = now()
         WHERE id = NEW.order_group_id AND verified_at IS NULL;
        RETURN NEW;
    END IF;

    -- first_order mode, still unverified.
    -- The first acknowledge of any order in the group verifies the table.
    IF NEW.status = 'acknowledged' THEN
        UPDATE public.order_groups
           SET verified_at = now(), updated_at = now()
         WHERE id = NEW.order_group_id AND verified_at IS NULL;
        RETURN NEW;
    END IF;

    -- No order may advance to ready/delivered while the group is unverified.
    IF NEW.status IN ('ready', 'delivered') THEN
        RAISE EXCEPTION 'GROUP_NOT_VERIFIED: acknowledge the first order to verify the table'
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$function$;
