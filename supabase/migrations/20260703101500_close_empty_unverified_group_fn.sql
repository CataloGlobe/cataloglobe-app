-- Auto-close an UNVERIFIED group once all its orders are cancelled, to avoid
-- lingering zombie groups (FASE 2 §2.3). Only unverified groups: verified groups
-- follow the normal close-table lifecycle. One statement, no wrapper (db-push
-- rule); the trigger is created in 20260703101600.
CREATE OR REPLACE FUNCTION public.close_empty_unverified_group()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_verified_at  timestamptz;
    v_active_count int;
BEGIN
    IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
        RETURN NEW;
    END IF;
    IF NEW.order_group_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT og.verified_at INTO v_verified_at
      FROM public.order_groups og WHERE og.id = NEW.order_group_id;
    IF v_verified_at IS NOT NULL THEN
        RETURN NEW;  -- verified groups untouched.
    END IF;

    SELECT count(*) INTO v_active_count
      FROM public.orders o
     WHERE o.order_group_id = NEW.order_group_id
       AND o.status <> 'cancelled';

    IF v_active_count = 0 THEN
        UPDATE public.order_groups
           SET status = 'closed', closed_at = now(), updated_at = now()
         WHERE id = NEW.order_group_id AND status = 'open';
    END IF;
    RETURN NEW;
END;
$function$;
