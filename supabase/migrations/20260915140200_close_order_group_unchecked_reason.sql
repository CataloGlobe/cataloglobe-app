-- =============================================================================
-- _close_order_group_unchecked(p_group_id, p_action, p_cancellation_reason) (2/6)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1, correzione a 20260915130300: identica in tutto salvo
-- il MOTIVO scritto in `orders.cancellation_reason` quando `p_action =
-- 'cancel'`, che ora arriva dal chiamante invece di essere cablato a
-- «Chiusura tavolo». Il cuore ha due ingressi — `close_table_with_resolution`
-- e `close_seating` — e lo Storico deve dire quale gesto ha annullato
-- l'ordine, non uno dei due a caso:
--   «Chiusura tavolo»                    da close_table_with_resolution
--   «Servizio concluso»                  da close_seating
--   «Chiusura automatica a fine servizio» da close_stale_seatings — mai
--                                        scritto in pratica: lo spazzino salta
--                                        le tavolate con ordini da decidere e
--                                        passa sempre `none`. Sta lì perché
--                                        il parametro è obbligatorio e una
--                                        stringa vuota sarebbe una bugia.
-- Obbligatorio e non vuoto: P0001 `INVALID_CANCELLATION_REASON`.
-- Il resto del header di 130300 vale ancora e non è ripetuto.
-- ACL in 140300.
-- =============================================================================

CREATE FUNCTION public._close_order_group_unchecked(
    p_group_id            uuid,
    p_action              text,
    p_cancellation_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_now                  timestamptz := now();
    v_status               text;
    v_open_count           int;
    v_resolved_count       int := 0;
    v_closed_orders_count  int := 0;
    v_cleared_bill_count   int := 0;
    v_cleared_waiter_count int := 0;
    v_ended_sessions_count int := 0;
BEGIN
    IF p_action NOT IN ('none', 'deliver', 'cancel') THEN
        RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'P0001';
    END IF;
    IF p_cancellation_reason IS NULL OR btrim(p_cancellation_reason) = '' THEN
        RAISE EXCEPTION 'INVALID_CANCELLATION_REASON' USING ERRCODE = 'P0001';
    END IF;

    SELECT og.status INTO v_status
      FROM public.order_groups og
     WHERE og.id = p_group_id
       FOR UPDATE;

    IF NOT FOUND OR v_status <> 'open' THEN
        RETURN jsonb_build_object(
            'group_id', p_group_id, 'closed', false,
            'resolved_orders_count', 0, 'closed_orders_count', 0,
            'cleared_bill_count', 0, 'cleared_waiter_count', 0,
            'ended_sessions_count', 0
        );
    END IF;

    SELECT count(*) INTO v_open_count
      FROM public.orders o
     WHERE o.order_group_id = p_group_id
       AND o.status IN ('submitted', 'acknowledged', 'ready');

    IF p_action = 'none' AND v_open_count > 0 THEN
        RAISE EXCEPTION 'OPEN_ORDERS_NEED_ACTION:%', v_open_count
            USING ERRCODE = '22023';
    END IF;

    IF p_action = 'deliver' AND v_open_count > 0 THEN
        UPDATE public.orders o
           SET status       = 'delivered',
               delivered_at = v_now,
               version      = o.version + 1,
               updated_at   = v_now
         WHERE o.order_group_id = p_group_id
           AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    ELSIF p_action = 'cancel' AND v_open_count > 0 THEN
        UPDATE public.orders o
           SET status              = 'cancelled',
               cancelled_at        = v_now,
               cancelled_by        = 'admin',
               cancellation_reason = p_cancellation_reason,
               version             = o.version + 1,
               updated_at          = v_now
         WHERE o.order_group_id = p_group_id
           AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    END IF;

    UPDATE public.order_groups og
       SET status     = 'closed',
           closed_at  = v_now,
           updated_at = v_now
     WHERE og.id = p_group_id
       AND og.status = 'open';

    SELECT count(*) INTO v_closed_orders_count
      FROM public.orders o
     WHERE o.order_group_id = p_group_id;

    WITH cleared AS (
        UPDATE public.customer_sessions cs
           SET bill_requested_at = NULL, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.bill_requested_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_bill_count FROM cleared;

    WITH cleared_waiter AS (
        UPDATE public.customer_sessions cs
           SET waiter_called_at = NULL, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.waiter_called_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_waiter_count FROM cleared_waiter;

    WITH ended AS (
        UPDATE public.customer_sessions cs
           SET expires_at = v_now, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.expires_at > v_now
        RETURNING cs.id
    )
    SELECT count(*) INTO v_ended_sessions_count FROM ended;

    RETURN jsonb_build_object(
        'group_id',              p_group_id,
        'closed',                true,
        'resolved_orders_count', v_resolved_count,
        'closed_orders_count',   v_closed_orders_count,
        'cleared_bill_count',    v_cleared_bill_count,
        'cleared_waiter_count',  v_cleared_waiter_count,
        'ended_sessions_count',  v_ended_sessions_count
    );
END;
$$;
