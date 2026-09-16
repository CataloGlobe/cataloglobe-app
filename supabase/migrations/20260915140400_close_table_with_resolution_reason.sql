-- =============================================================================
-- close_table_with_resolution — motivo «Chiusura tavolo» (4/6)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1, correzione: passa il motivo di annullamento al cuore
-- `_close_order_group_unchecked(uuid, text, text)` (20260915140200).
-- Firma invariata → CREATE OR REPLACE conserva l'ACL. Corpo identico a
-- 20260915130500 salvo la chiamata; il header di quella migration vale ancora.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.close_table_with_resolution(
    p_table_id  uuid,
    p_tenant_id uuid,
    p_action    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_table_tenant_id      uuid;
    v_table_deleted_at     timestamptz;
    v_now                  timestamptz := now();
    v_open_count           int;
    v_group_id             uuid;
    v_seating_id           uuid;
    v_seating_ids          uuid[] := '{}';
    v_result               jsonb;
    v_resolved_count       int := 0;
    v_closed_groups_count  int := 0;
    v_closed_orders_count  int := 0;
    v_cleared_bill_count   int := 0;
    v_cleared_waiter_count int := 0;
    v_ended_sessions_count int := 0;
    v_residual             int := 0;
BEGIN
    -- 1. Validazione p_action: whitelist rigida.
    IF p_action NOT IN ('none', 'deliver', 'cancel') THEN
        RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'P0001';
    END IF;

    -- Lookup tavolo + sanity tenant.
    SELECT t.tenant_id, t.deleted_at
      INTO v_table_tenant_id, v_table_deleted_at
      FROM public.tables t
     WHERE t.id = p_table_id;

    IF v_table_tenant_id IS NULL OR v_table_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'TABLE_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;
    IF v_table_tenant_id <> p_tenant_id THEN
        RAISE EXCEPTION 'TENANT_MISMATCH' USING ERRCODE = 'P0001';
    END IF;

    -- 2. Ordini aperti del tavolo. Action 'none' con aperti → 409 in Edge.
    SELECT count(*) INTO v_open_count
      FROM public.orders o
     WHERE o.table_id = p_table_id
       AND o.tenant_id = p_tenant_id
       AND o.status IN ('submitted', 'acknowledged', 'ready');

    IF p_action = 'none' AND v_open_count > 0 THEN
        RAISE EXCEPTION 'TABLE_HAS_OPEN_ORDERS:%', v_open_count
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. Ogni conto aperto del tavolo, nel cuore condiviso.
    FOR v_group_id, v_seating_id IN
        SELECT og.id, og.seating_id
          FROM public.order_groups og
         WHERE og.table_id  = p_table_id
           AND og.tenant_id = p_tenant_id
           AND og.status    = 'open'
         ORDER BY og.created_at
    LOOP
        v_result := public._close_order_group_unchecked(v_group_id, p_action, 'Chiusura tavolo');
        IF (v_result->>'closed')::boolean THEN
            v_closed_groups_count  := v_closed_groups_count + 1;
            v_resolved_count       := v_resolved_count       + (v_result->>'resolved_orders_count')::int;
            v_closed_orders_count  := v_closed_orders_count  + (v_result->>'closed_orders_count')::int;
            v_cleared_bill_count   := v_cleared_bill_count   + (v_result->>'cleared_bill_count')::int;
            v_cleared_waiter_count := v_cleared_waiter_count + (v_result->>'cleared_waiter_count')::int;
            v_ended_sessions_count := v_ended_sessions_count + (v_result->>'ended_sessions_count')::int;
        END IF;
        IF v_seating_id IS NOT NULL AND NOT (v_seating_id = ANY (v_seating_ids)) THEN
            v_seating_ids := v_seating_ids || v_seating_id;
        END IF;
    END LOOP;

    -- 4. Residuo per tavolo: sessioni senza conto, come prima.
    WITH cleared AS (
        UPDATE public.customer_sessions cs
           SET bill_requested_at = NULL, updated_at = v_now
         WHERE cs.current_table_id = p_table_id
           AND cs.tenant_id = p_tenant_id
           AND cs.bill_requested_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_residual FROM cleared;
    v_cleared_bill_count := v_cleared_bill_count + v_residual;

    WITH cleared_waiter AS (
        UPDATE public.customer_sessions cs
           SET waiter_called_at = NULL, updated_at = v_now
         WHERE cs.current_table_id = p_table_id
           AND cs.tenant_id = p_tenant_id
           AND cs.waiter_called_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_residual FROM cleared_waiter;
    v_cleared_waiter_count := v_cleared_waiter_count + v_residual;

    WITH ended AS (
        UPDATE public.customer_sessions cs
           SET expires_at = v_now, updated_at = v_now
         WHERE cs.current_table_id = p_table_id
           AND cs.tenant_id = p_tenant_id
           AND cs.expires_at > v_now
        RETURNING cs.id
    )
    SELECT count(*) INTO v_residual FROM ended;
    v_ended_sessions_count := v_ended_sessions_count + v_residual;

    -- 5. Le tavolate di quei conti: la comitiva si è alzata.
    FOREACH v_seating_id IN ARRAY v_seating_ids LOOP
        PERFORM public._close_seating_unchecked(v_seating_id, 'operator');
    END LOOP;

    RETURN jsonb_build_object(
        'table_id',              p_table_id,
        'resolved_action',       p_action,
        'resolved_orders_count', v_resolved_count,
        'closed_groups_count',   v_closed_groups_count,
        'closed_orders_count',   v_closed_orders_count,
        'cleared_bill_count',    v_cleared_bill_count,
        'cleared_waiter_count',  v_cleared_waiter_count,
        'ended_sessions_count',  v_ended_sessions_count,
        'closed_seatings_count', COALESCE(array_length(v_seating_ids, 1), 0)
    );
END;
$$;
