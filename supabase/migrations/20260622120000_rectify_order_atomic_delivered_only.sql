-- ============================================================
-- rectify_order_atomic — restrict rectification (storno) to DELIVERED only.
--
-- Model change (FASE 2b-3): a rectification is an accounting reversal of a
-- consumed product, so it is only valid once the order is `delivered`. The
-- pre-service path (submitted | acknowledged | ready) uses "Annulla articolo"
-- (cancel_order_item_atomic), not a storno.
--
-- Re-emits the function VERBATIM from 20260619170000 via CREATE OR REPLACE,
-- changing ONLY the parent-state guard in Section 2:
--   - was: IF v_parent_status NOT IN ('acknowledged', 'delivered')
--   - now: IF v_parent_status <> 'delivered'
--   and the RAISE message accordingly. Everything else (cumulative residual
--   cap, FOR UPDATE, payload dedup, parent_order_item_id lineage, total) is
--   IDENTICAL. CREATE OR REPLACE preserves existing GRANT/REVOKE → no grants
--   here, db push stays clean (no 42601).
--
-- The edge function (rectify-order) maps INVALID_PARENT_STATE by prefix +
-- regex on the reported status → unchanged.
-- ============================================================

CREATE OR REPLACE FUNCTION public.rectify_order_atomic(p_parent_order_id uuid, p_items_to_storno jsonb, p_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_parent_tenant_id        uuid;
    v_parent_activity_id      uuid;
    v_parent_table_id         uuid;
    v_parent_session_id       uuid;
    v_parent_group_id         uuid;
    v_parent_is_rectification boolean;
    v_parent_status           text;
    v_parent_customer_name    text;

    v_total_amount            numeric(10,2) := 0;
    v_rectification_id        uuid;
    v_created_at              timestamptz;

    v_storno_item             jsonb;
    v_original_item_id        uuid;
    v_storno_qty              smallint;
    v_original_qty            smallint;
    v_original_price          numeric(10,2);

    -- Cumulative residual cap (new)
    v_req                     record;
    v_already_stornato        smallint;
    v_residual                smallint;
BEGIN
    -- ============================================================
    -- Section 1 — Defensive parameter validation
    -- ============================================================
    IF p_parent_order_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMS: parent_order_id is NULL'
            USING ERRCODE = '22023';
    END IF;

    IF p_items_to_storno IS NULL
       OR jsonb_typeof(p_items_to_storno) <> 'array'
       OR jsonb_array_length(p_items_to_storno) = 0 THEN
        RAISE EXCEPTION 'INVALID_PARAMS: empty or invalid items_to_storno array'
            USING ERRCODE = '22023';
    END IF;

    -- ============================================================
    -- Section 2 — Load + validate parent order
    -- ============================================================
    SELECT
        o.tenant_id, o.activity_id, o.table_id, o.customer_session_id,
        o.order_group_id, o.is_rectification, o.status, o.customer_name_snapshot
      INTO
        v_parent_tenant_id, v_parent_activity_id, v_parent_table_id, v_parent_session_id,
        v_parent_group_id, v_parent_is_rectification, v_parent_status, v_parent_customer_name
      FROM public.orders o
     WHERE o.id = p_parent_order_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PARENT_ORDER_NOT_FOUND';
    END IF;
    IF v_parent_is_rectification THEN
        RAISE EXCEPTION 'INVALID_PARENT: cannot rectify a rectification order';
    END IF;
    IF v_parent_status <> 'delivered' THEN
        RAISE EXCEPTION 'INVALID_PARENT_STATE: parent order must be delivered, got %', v_parent_status;
    END IF;

    -- ============================================================
    -- Section 3 — Validate items_to_storno + enforce cumulative
    --             per-line residual cap + accumulate total
    -- ============================================================
    -- Pass A — per-element shape validation (mirrors the original
    -- INVALID_STORNO_ITEM guard). Done before aggregation so that a NULL
    -- order_item_id or a non-positive quantity cannot silently collapse
    -- into a GROUP BY bucket in Pass B.
    FOR v_storno_item IN SELECT * FROM jsonb_array_elements(p_items_to_storno) LOOP
        v_original_item_id := (v_storno_item->>'order_item_id')::uuid;
        v_storno_qty       := (v_storno_item->>'quantity')::smallint;

        IF v_original_item_id IS NULL OR v_storno_qty IS NULL OR v_storno_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_STORNO_ITEM: order_item_id null or quantity not positive';
        END IF;
    END LOOP;

    -- Pass B — aggregate requested storno quantities per parent order_item
    -- (dedup: the same order_item_id appearing more than once in the payload
    -- is summed BEFORE the cap check, so it cannot bypass the residual in a
    -- single call). For each distinct line the residual stornabile is the
    -- original quantity minus everything already stornato by prior,
    -- non-cancelled rectifications of this same parent, keyed by the
    -- parent_order_item_id lineage column.
    FOR v_req IN
        SELECT (elem->>'order_item_id')::uuid          AS order_item_id,
               SUM((elem->>'quantity')::int)::smallint AS req_qty
          FROM jsonb_array_elements(p_items_to_storno) AS elem
         GROUP BY (elem->>'order_item_id')::uuid
    LOOP
        SELECT oi.unit_price_snapshot, oi.quantity
          INTO v_original_price, v_original_qty
          FROM public.order_items oi
         WHERE oi.id = v_req.order_item_id
           AND oi.order_id = p_parent_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND: % not in parent order', v_req.order_item_id;
        END IF;

        SELECT COALESCE(SUM(oi.quantity), 0)::smallint
          INTO v_already_stornato
          FROM public.order_items oi
          JOIN public.orders o ON o.id = oi.order_id
         WHERE o.parent_order_id = p_parent_order_id
           AND o.is_rectification = true
           AND o.cancelled_at IS NULL
           AND oi.parent_order_item_id = v_req.order_item_id;

        v_residual := v_original_qty - v_already_stornato;

        IF v_req.req_qty > v_residual THEN
            RAISE EXCEPTION 'STORNO_QTY_EXCEEDS_RESIDUAL: item % requested % but only % stornabile (original %, already stornato %)',
                v_req.order_item_id, v_req.req_qty, v_residual, v_original_qty, v_already_stornato;
        END IF;

        v_total_amount := v_total_amount + (v_req.req_qty * v_original_price);
    END LOOP;

    -- ============================================================
    -- Section 4 — INSERT rectification order
    -- ============================================================
    -- `version`, `currency`, `submitted_at`, `created_at`, `updated_at`
    -- rely on column defaults. `is_rectification = true` is the flag the
    -- billing rollup keys on. `status = 'delivered'` is the contractual
    -- final state for rectifications (they are bookkeeping entries, not
    -- a fulfillment lifecycle).
    INSERT INTO public.orders (
        tenant_id,
        activity_id,
        table_id,
        customer_session_id,
        order_group_id,
        status,
        total_amount,
        customer_name_snapshot,
        notes,
        parent_order_id,
        is_rectification
    ) VALUES (
        v_parent_tenant_id,
        v_parent_activity_id,
        v_parent_table_id,
        v_parent_session_id,
        v_parent_group_id,
        'delivered',
        v_total_amount,
        v_parent_customer_name,
        p_notes,
        p_parent_order_id,
        true
    )
    RETURNING id, created_at
    INTO v_rectification_id, v_created_at;

    -- ============================================================
    -- Section 5 — INSERT batch rectification order_items
    -- ============================================================
    -- Snapshot fields (product_id, name, unit_price_snapshot, options,
    -- item_notes) are COPIED from the parent's items so the rectification
    -- remains readable independently of any future product changes.
    -- `quantity` is the storno quantity from the input array;
    -- `line_total` is recomputed against the FROZEN snapshot price.
    -- `parent_order_item_id` records the row->row lineage used by the
    -- cumulative residual cap in Section 3.
    -- The `oi.order_id = p_parent_order_id` filter is defensive: Section 3
    -- already guaranteed it, but the check is cheap and protects against
    -- accidental cross-order leakage if the input array is ever mutated.
    INSERT INTO public.order_items (
        order_id,
        product_id,
        product_name_snapshot,
        unit_price_snapshot,
        quantity,
        line_total,
        options_snapshot,
        item_notes,
        parent_order_item_id
    )
    SELECT
        v_rectification_id,
        oi.product_id,
        oi.product_name_snapshot,
        oi.unit_price_snapshot,
        (item->>'quantity')::smallint,
        ((item->>'quantity')::smallint * oi.unit_price_snapshot)::numeric(10,2),
        oi.options_snapshot,
        oi.item_notes,
        oi.id
    FROM jsonb_array_elements(p_items_to_storno) AS item
    JOIN public.order_items oi
      ON oi.id = (item->>'order_item_id')::uuid
     AND oi.order_id = p_parent_order_id;

    -- ============================================================
    -- Section 6 — Return payload
    -- ============================================================
    RETURN jsonb_build_object(
        'rectification_order_id', v_rectification_id,
        'parent_order_id',        p_parent_order_id,
        'total_amount',           v_total_amount,
        'items_count',            jsonb_array_length(p_items_to_storno),
        'created_at',             v_created_at
    );
END;
$function$
;
