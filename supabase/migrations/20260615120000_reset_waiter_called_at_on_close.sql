-- Estende close_table_with_resolution per azzerare waiter_called_at
-- alla chiusura tavolo, gemello del blocco bill_requested_at esistente.
-- Ri-emissione integrale della funzione live (letta via pg_get_functiondef)
-- con sole due modifiche: (1) nuova variabile v_cleared_waiter_count, (2)
-- blocco CTE waiter_called_at, (3) campo aggiunto al RETURN jsonb.
CREATE OR REPLACE FUNCTION public.close_table_with_resolution(p_table_id uuid, p_tenant_id uuid, p_action text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_table_tenant_id uuid;
    v_table_deleted_at timestamptz;
    v_now timestamptz := now();
    v_open_count int;
    v_resolved_count int;
    v_closed_group_ids uuid[];
    v_closed_orders_count int := 0;
    v_cleared_bill_count int := 0;
    v_cleared_waiter_count int := 0;
    v_ended_sessions_count int := 0;
BEGIN
    -- Validazione p_action: whitelist rigida.
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

    -- Conta ordini aperti (submitted + acknowledged + ready).
    SELECT count(*)
        INTO v_open_count
        FROM public.orders o
        WHERE o.table_id = p_table_id
          AND o.tenant_id = p_tenant_id
          AND o.status IN ('submitted', 'acknowledged', 'ready');

    -- Action 'none' con aperti -> 409 a livello Edge.
    IF p_action = 'none' AND v_open_count > 0 THEN
        RAISE EXCEPTION 'TABLE_HAS_OPEN_ORDERS:%', v_open_count
            USING ERRCODE = 'P0001';
    END IF;

    -- Risoluzione bulk in base all'azione.
    IF p_action = 'deliver' AND v_open_count > 0 THEN
        UPDATE public.orders o
            SET status = 'delivered',
                delivered_at = v_now,
                version = o.version + 1,
                updated_at = v_now
            WHERE o.table_id = p_table_id
              AND o.tenant_id = p_tenant_id
              AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    ELSIF p_action = 'cancel' AND v_open_count > 0 THEN
        UPDATE public.orders o
            SET status = 'cancelled',
                cancelled_at = v_now,
                cancelled_by = 'admin',
                cancellation_reason = 'Chiusura tavolo',
                version = o.version + 1,
                updated_at = v_now
            WHERE o.table_id = p_table_id
              AND o.tenant_id = p_tenant_id
              AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    ELSE
        v_resolved_count := 0;
    END IF;

    -- Chiusura order_groups aperti del tavolo.
    WITH closed AS (
        UPDATE public.order_groups og
            SET status = 'closed',
                closed_at = v_now,
                updated_at = v_now
            WHERE og.table_id = p_table_id
              AND og.tenant_id = p_tenant_id
              AND og.status = 'open'
            RETURNING og.id
    )
    SELECT array_agg(id) INTO v_closed_group_ids FROM closed;

    -- Count ordini totali sui gruppi appena chiusi (informativo, mirror
    -- del comportamento pre-esistente dell'edge fn).
    IF v_closed_group_ids IS NOT NULL AND array_length(v_closed_group_ids, 1) > 0 THEN
        SELECT count(*) INTO v_closed_orders_count
            FROM public.orders o
            WHERE o.order_group_id = ANY(v_closed_group_ids);
    END IF;

    -- Clear bill_requested_at su tutte le sessions attive del tavolo
    -- (idempotent, non-bloccante). Stesso pattern del comportamento
    -- pre-esistente.
    WITH cleared AS (
        UPDATE public.customer_sessions cs
            SET bill_requested_at = NULL,
                updated_at = v_now
            WHERE cs.current_table_id = p_table_id
              AND cs.tenant_id = p_tenant_id
              AND cs.bill_requested_at IS NOT NULL
            RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_bill_count FROM cleared;

    -- Clear waiter_called_at su tutte le sessions attive del tavolo
    -- (idempotent, non-bloccante). Gemello del blocco bill_requested_at.
    WITH cleared_waiter AS (
        UPDATE public.customer_sessions cs
            SET waiter_called_at = NULL,
                updated_at = v_now
            WHERE cs.current_table_id = p_table_id
              AND cs.tenant_id = p_tenant_id
              AND cs.waiter_called_at IS NOT NULL
            RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_waiter_count FROM cleared_waiter;

    -- ─── NUOVO STEP: terminazione sessioni attive del tavolo ───────────
    -- expires_at = v_now su tutte le sessions agganciate al tavolo con
    -- expires_at > v_now. Idempotent: sessioni gia' scadute non vengono
    -- ri-toccate. Tenant_id filtrato defense-in-depth.
    --
    -- Effetto:
    -- - active_sessions_count della view v_tables_with_state (filter
    --   expires_at > now()) torna immediatamente al netto delle sessions
    --   chiuse -> il tavolo passa a "Libero" senza attesa TTL.
    -- - resolve-table al prossimo scan QR non riusa la sessione expired
    --   (entrambi i reuse path filtrano expires_at > now()) -> nuova
    --   session, nuovo JWT, nuovo customer_session_id.
    WITH ended AS (
        UPDATE public.customer_sessions cs
            SET expires_at = v_now,
                updated_at = v_now
            WHERE cs.current_table_id = p_table_id
              AND cs.tenant_id = p_tenant_id
              AND cs.expires_at > v_now
            RETURNING cs.id
    )
    SELECT count(*) INTO v_ended_sessions_count FROM ended;

    RETURN jsonb_build_object(
        'table_id', p_table_id,
        'resolved_action', p_action,
        'resolved_orders_count', v_resolved_count,
        'closed_groups_count', COALESCE(array_length(v_closed_group_ids, 1), 0),
        'closed_orders_count', v_closed_orders_count,
        'cleared_bill_count', v_cleared_bill_count,
        'cleared_waiter_count', v_cleared_waiter_count,
        'ended_sessions_count', v_ended_sessions_count
    );
END;
$function$;
