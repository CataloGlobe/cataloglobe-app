-- ============================================================
-- cancel_order_item_atomic — soft-cancel a single order_item on a
-- non-served order, atomically adjusting the order total.
--
-- Pre-service flow (FASE 2b): removes ONE line without creating a storno.
-- The line is flagged (order_items.cancelled_at), the order total is
-- reduced by that line's line_total, and the order version is bumped.
-- If no active line remains, the whole order auto-cancels.
--
-- v1 = whole-line cancel only (no partial quantity — future extension).
--
-- SECURITY DEFINER + search_path='' + service-role-only grants, mirroring
-- rectify_order_atomic. The edge function (cancel-order-item) performs the
-- JWT + tenant-membership gate BEFORE invoking this via service_role.
-- ============================================================

CREATE OR REPLACE FUNCTION public.cancel_order_item_atomic(p_order_id uuid, p_order_item_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_is_rectification boolean;
    v_status           text;
    v_line_total       numeric(10,2);
    v_item_cancelled   timestamptz;
    v_new_total        numeric(10,2);
    v_remaining        integer;
    v_order_cancelled  boolean := false;
BEGIN
    -- 1. Lock the parent order row to serialize concurrent cancels
    --    (double-click / two waiters on the same comanda).
    SELECT o.is_rectification, o.status
      INTO v_is_rectification, v_status
      FROM public.orders o
     WHERE o.id = p_order_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    -- 2. A rectification order is not a cancellable target.
    IF v_is_rectification THEN
        RAISE EXCEPTION 'INVALID_TARGET: cannot cancel an item of a rectification order';
    END IF;

    -- 3. Only pre-service states allow per-item cancel.
    IF v_status NOT IN ('submitted', 'acknowledged', 'ready') THEN
        RAISE EXCEPTION 'INVALID_STATE_FOR_CANCEL: order must be submitted, acknowledged or ready, got %', v_status;
    END IF;

    -- 4. Load the target line: must belong to the order and still be active.
    SELECT oi.line_total, oi.cancelled_at
      INTO v_line_total, v_item_cancelled
      FROM public.order_items oi
     WHERE oi.id = p_order_item_id
       AND oi.order_id = p_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ITEM_NOT_FOUND: % not in order %', p_order_item_id, p_order_id;
    END IF;
    IF v_item_cancelled IS NOT NULL THEN
        RAISE EXCEPTION 'ITEM_ALREADY_CANCELLED: % already cancelled', p_order_item_id;
    END IF;

    -- 5. Soft-cancel the line.
    UPDATE public.order_items
       SET cancelled_at  = now(),
           cancel_reason = p_reason
     WHERE id = p_order_item_id;

    -- 6. Reduce the order total by the cancelled line + bump version.
    --    updated_at is also set by the orders_set_updated_at trigger;
    --    version has no trigger and must be incremented explicitly.
    UPDATE public.orders
       SET total_amount = total_amount - v_line_total,
           version      = version + 1,
           updated_at   = now()
     WHERE id = p_order_id
    RETURNING total_amount INTO v_new_total;

    -- 7. If no active line remains, auto-cancel the whole order.
    SELECT count(*)
      INTO v_remaining
      FROM public.order_items oi
     WHERE oi.order_id = p_order_id
       AND oi.cancelled_at IS NULL;

    IF v_remaining = 0 THEN
        UPDATE public.orders
           SET status       = 'cancelled',
               cancelled_at = now(),
               version      = version + 1
         WHERE id = p_order_id
        RETURNING total_amount INTO v_new_total;
        v_order_cancelled := true;
    END IF;

    -- 8. Return payload.
    RETURN jsonb_build_object(
        'order_id',        p_order_id,
        'item_id',         p_order_item_id,
        'new_order_total', v_new_total,
        'order_cancelled', v_order_cancelled
    );
END;
$function$;

-- NOTE: grants live in the next migration file
-- (20260621130001_cancel_order_item_atomic_grants.sql). Keeping
-- CREATE OR REPLACE FUNCTION and REVOKE/GRANT in the SAME file makes
-- `supabase db push` fail with SQLSTATE 42601 (see CLAUDE.md / storage-sql.md).
-- Split into two consecutive files so a plain `db push` works on staging + prod.
