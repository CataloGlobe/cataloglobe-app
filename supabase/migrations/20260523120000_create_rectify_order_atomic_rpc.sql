-- =========================================
-- ORDERS EPIC — Phase 2.11a: rectify_order_atomic RPC
-- =========================================
-- Atomic RPC that creates a partial rectification (storno) of an existing
-- order in a single PL/pgSQL transaction.
--
-- Rectification model (docs/orders-architecture.md §9.2):
--   - A rectification is a SEPARATE `orders` row with `is_rectification =
--     true`, `status = 'delivered'`, and `parent_order_id` pointing at the
--     order being adjusted. Its `total_amount` is the SUM of the storno
--     amounts (stored positive); table totals subtract rectifications:
--         table_total = SUM(o.total_amount) FILTER (NOT is_rectification)
--                     - SUM(o.total_amount) FILTER (is_rectification)
--   - The rectification's `order_items` rows are snapshot COPIES of the
--     parent's `order_items` (product_id, name, unit_price_snapshot,
--     options_snapshot, item_notes), but with `quantity` set to the
--     storno quantity and `line_total = storno_qty * unit_price_snapshot`
--     computed against the original snapshot price (frozen at submit
--     time).
--   - Tenant / activity / table / customer_session / order_group are
--     inherited from the parent so the rectification stays attached to
--     the same logical "table session" for billing.
--
-- Atomicity: PL/pgSQL function body runs inside the caller's transaction
-- (supabase.rpc() wraps an implicit BEGIN/COMMIT). Any RAISE rolls back
-- both the orders INSERT and the order_items batch INSERT. No partial
-- state.
--
-- Trust boundary: this RPC is downstream of the `rectify-order` Edge
-- Function (task 2.11b) which validates Supabase user JWT + tenant
-- membership against the parent order. The RPC therefore does NOT
-- re-validate auth. It only enforces structural invariants:
--   - parent exists and is itself NOT a rectification
--   - parent is in a rectifiable state ('acknowledged' or 'delivered')
--   - every referenced order_item belongs to the parent
--   - every storno quantity is positive and ≤ the original quantity
--
-- Error codes:
--   - 'INVALID_PARAMS: ...' (ERRCODE 22023, invalid_parameter_value):
--     defensive shape check failed. Caller should have validated upstream.
--   - 'PARENT_ORDER_NOT_FOUND' (ERRCODE P0001): parent_order_id has no
--     matching row.
--   - 'INVALID_PARENT: ...' (P0001): parent is itself a rectification.
--   - 'INVALID_PARENT_STATE: ...' (P0001): parent status is not in the
--     rectifiable set.
--   - 'INVALID_STORNO_ITEM: ...' (P0001): an entry in items_to_storno has
--     null order_item_id or non-positive quantity.
--   - 'ORDER_ITEM_NOT_FOUND: ...' (P0001): an item id does not belong to
--     the parent order.
--   - 'STORNO_QTY_EXCEEDS_ORIGINAL: ...' (P0001): storno quantity is
--     greater than the original quantity for that item.
--
-- Security hardening (CLAUDE.md → "Funzioni SQL → SECURITY DEFINER
-- service-role-only"):
--   - VOLATILE, SECURITY DEFINER, SET search_path TO ''.
--   - All identifiers fully qualified (public.<table>).
--   - REVOKE FROM PUBLIC + anon + authenticated, GRANT only to
--     service_role. Mirrors the hardening applied to submit_order_atomic
--     in migration 20260521172001.
--
-- References:
--   - docs/orders-architecture.md v1.2 §9.2 (rectification model)
--   - Style reference: 20260521172000_create_submit_order_atomic_rpc.sql
--   - Grants pattern: 20260521172001_grant_submit_order_atomic.sql
BEGIN;
CREATE OR REPLACE FUNCTION public.rectify_order_atomic(
    p_parent_order_id  uuid,
    p_items_to_storno  jsonb,
    p_notes            text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
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
     WHERE o.id = p_parent_order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PARENT_ORDER_NOT_FOUND';
    END IF;
    IF v_parent_is_rectification THEN
        RAISE EXCEPTION 'INVALID_PARENT: cannot rectify a rectification order';
    END IF;
    IF v_parent_status NOT IN ('acknowledged', 'delivered') THEN
        RAISE EXCEPTION 'INVALID_PARENT_STATE: parent order must be acknowledged or delivered, got %', v_parent_status;
    END IF;

    -- ============================================================
    -- Section 3 — Validate items_to_storno + accumulate total
    -- ============================================================
    -- Iterate each storno entry: verify the referenced order_item belongs
    -- to the parent, verify the storno quantity is within bounds, and
    -- accumulate the total storno amount. The INSERT batch in Section 5
    -- re-joins on the same array; we do not collapse the two passes
    -- because the per-item RAISE messages here give the Edge Function
    -- precise error mapping per failing entry.
    FOR v_storno_item IN SELECT * FROM jsonb_array_elements(p_items_to_storno) LOOP
        v_original_item_id := (v_storno_item->>'order_item_id')::uuid;
        v_storno_qty       := (v_storno_item->>'quantity')::smallint;

        IF v_original_item_id IS NULL OR v_storno_qty IS NULL OR v_storno_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_STORNO_ITEM: order_item_id null or quantity not positive';
        END IF;

        SELECT oi.unit_price_snapshot, oi.quantity
          INTO v_original_price, v_original_qty
          FROM public.order_items oi
         WHERE oi.id = v_original_item_id
           AND oi.order_id = p_parent_order_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'ORDER_ITEM_NOT_FOUND: % not in parent order', v_original_item_id;
        END IF;
        IF v_storno_qty > v_original_qty THEN
            RAISE EXCEPTION 'STORNO_QTY_EXCEEDS_ORIGINAL: storno % > original % for item %',
                v_storno_qty, v_original_qty, v_original_item_id;
        END IF;

        v_total_amount := v_total_amount + (v_storno_qty * v_original_price);
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
        item_notes
    )
    SELECT
        v_rectification_id,
        oi.product_id,
        oi.product_name_snapshot,
        oi.unit_price_snapshot,
        (item->>'quantity')::smallint,
        ((item->>'quantity')::smallint * oi.unit_price_snapshot)::numeric(10,2),
        oi.options_snapshot,
        oi.item_notes
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
$function$;
-- =========================================
-- Grants — service-role-only (CLAUDE.md SECURITY DEFINER pattern)
-- =========================================
-- REVOKE FROM PUBLIC alone is insufficient on Supabase: project bootstrap
-- runs ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO anon,
-- authenticated, service_role on schema public. Explicit REVOKEs from
-- anon and authenticated are required to actually strip those grants.
REVOKE EXECUTE ON FUNCTION public.rectify_order_atomic(uuid, jsonb, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.rectify_order_atomic(uuid, jsonb, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.rectify_order_atomic(uuid, jsonb, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.rectify_order_atomic(uuid, jsonb, text) TO service_role;
COMMIT;
