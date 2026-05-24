-- =========================================
-- ORDERS EPIC — Phase 2.5a: submit_order_atomic RPC
-- =========================================
-- Atomic RPC that absorbs every DB write required to register a freshly
-- validated order in a single PL/pgSQL transaction:
--
--   1. Resolve `order_group_id`:
--        - Branch A: caller supplied `p_target_group_id` ("ordina con il
--          gruppo X"). Verify the group exists, is `open`, belongs to the
--          same table and tenant. Mismatch → RAISE 'GROUP_CONFLICT: ...'.
--        - Branch B: `p_target_group_id` is NULL. Reuse the open group
--          already linked to the customer_session if any, otherwise
--          INSERT a fresh `order_groups` row (lazy creation) and link it
--          to the customer_session.
--   2. INSERT into `public.orders` (one ticket row).
--   3. INSERT batch into `public.order_items` from `jsonb_array_elements`.
--   4. UPDATE `public.customer_sessions.last_activity_at`.
--
-- Atomicity: PL/pgSQL function bodies run inside the caller's transaction
-- (the supabase.rpc() call wraps it in an implicit BEGIN/COMMIT). Any
-- failing statement triggers an automatic rollback of every prior write
-- within this function. No half-applied state is possible.
--
-- Trust boundary: this RPC is downstream of `validateAndSnapshotOrderItems`
-- (supabase/functions/_shared/validateOrderItems.ts), which re-derives
-- tenant_id / activity_id / table_id from the JWT-validated
-- customer_session row and snapshots every line item with server-computed
-- prices. The RPC therefore does NOT re-validate business logic (catalog
-- membership, pricing, option groups, tenant membership). It only enforces
-- a tiny set of defensive NOT-NULL / shape checks to refuse blatantly
-- broken inputs and to avoid INSERTing NULL into NOT NULL columns.
--
-- Error codes:
--   - 'INVALID_PARAMS: ...' (ERRCODE 22023, invalid_parameter_value):
--     defensive check failed. The caller should have validated upstream;
--     this is treated as 500 INTERNAL by the Edge Function.
--   - 'GROUP_CONFLICT: ...' (ERRCODE P0001, default RAISE): caller asked
--     to fuse with a target group that is closed / mismatched / missing.
--     The Edge Function maps this to 409 GROUP_CONFLICT.
--
-- Security hardening (CLAUDE.md → "Funzioni SQL → SECURITY DEFINER
-- service-role-only"):
--   - VOLATILE: function mutates DB state.
--   - SECURITY DEFINER: runs with the owner's identity; required so that
--     service_role can INSERT through RLS without anon/authenticated being
--     able to invoke the function at all.
--   - SET search_path TO '': prevents search_path hijacking. Every
--     identifier in the body is fully qualified (public.<table>).
--   - REVOKE EXECUTE FROM PUBLIC + anon + authenticated, then GRANT only
--     to service_role. Mirrors the hardening applied to
--     `increment_rate_limit` in migration 20260520220349.
--
-- References:
--   - docs/orders-architecture.md v1.2 §6, §7 (orders + order_groups lifecycle)
--   - Style reference: 20260520215107_create_increment_rate_limit_rpc.sql
--   - Grants pattern: 20260520220349_harden_increment_rate_limit_grants.sql
BEGIN;
CREATE OR REPLACE FUNCTION public.submit_order_atomic(
    p_tenant_id              uuid,
    p_activity_id            uuid,
    p_table_id               uuid,
    p_customer_session_id    uuid,
    p_customer_name_snapshot text,
    p_resolved_schedule_id   uuid,
    p_total_amount           numeric,
    p_notes                  text,
    p_items                  jsonb,
    p_target_group_id        uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_order_group_id            uuid;
    v_order_id                  uuid;
    v_created_at                timestamptz;
    v_existing_session_group_id uuid;
    v_target_status             text;
    v_target_table_id           uuid;
    v_target_tenant_id          uuid;
BEGIN
    -- ============================================================
    -- Section 1 — Defensive parameter validation
    -- ============================================================
    -- These checks are NOT a substitute for upstream validation; they
    -- exist to refuse trivially broken calls and to provide friendlier
    -- error messages than raw NOT NULL constraint failures.
    IF p_tenant_id IS NULL
       OR p_activity_id IS NULL
       OR p_table_id IS NULL
       OR p_customer_session_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMS: required id parameter is NULL'
            USING ERRCODE = '22023';
    END IF;

    IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PARAMS: total_amount must be > 0'
            USING ERRCODE = '22023';
    END IF;

    IF p_items IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_PARAMS: empty or invalid items array'
            USING ERRCODE = '22023';
    END IF;

    -- ============================================================
    -- Section 2 — Resolve order_group_id
    -- ============================================================
    IF p_target_group_id IS NOT NULL THEN
        -- Branch A: caller asked to fuse with a specific target group.
        SELECT og.status, og.table_id, og.tenant_id
          INTO v_target_status, v_target_table_id, v_target_tenant_id
          FROM public.order_groups og
         WHERE og.id = p_target_group_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'GROUP_CONFLICT: target group not found';
        END IF;
        IF v_target_status <> 'open' THEN
            RAISE EXCEPTION 'GROUP_CONFLICT: target group is closed';
        END IF;
        IF v_target_table_id <> p_table_id THEN
            RAISE EXCEPTION 'GROUP_CONFLICT: target group belongs to different table';
        END IF;
        IF v_target_tenant_id <> p_tenant_id THEN
            RAISE EXCEPTION 'GROUP_CONFLICT: target group belongs to different tenant';
        END IF;

        v_order_group_id := p_target_group_id;
    ELSE
        -- Branch B: lazy creation or reuse of the session's open group.
        SELECT cs.order_group_id
          INTO v_existing_session_group_id
          FROM public.customer_sessions cs
         WHERE cs.id = p_customer_session_id;

        IF v_existing_session_group_id IS NOT NULL THEN
            SELECT og.status
              INTO v_target_status
              FROM public.order_groups og
             WHERE og.id = v_existing_session_group_id;

            IF FOUND AND v_target_status = 'open' THEN
                v_order_group_id := v_existing_session_group_id;
            END IF;
        END IF;

        IF v_order_group_id IS NULL THEN
            INSERT INTO public.order_groups (
                tenant_id, activity_id, table_id, status
            ) VALUES (
                p_tenant_id, p_activity_id, p_table_id, 'open'
            )
            RETURNING id INTO v_order_group_id;

            UPDATE public.customer_sessions
               SET order_group_id    = v_order_group_id,
                   last_activity_at  = now()
             WHERE id = p_customer_session_id;
        END IF;
    END IF;

    -- ============================================================
    -- Section 3 — INSERT orders
    -- ============================================================
    -- `submitted_at`, `created_at`, `updated_at`, `version`, `currency`,
    -- `is_rectification` rely on column defaults.
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
        resolved_schedule_id
    ) VALUES (
        p_tenant_id,
        p_activity_id,
        p_table_id,
        p_customer_session_id,
        v_order_group_id,
        'submitted',
        p_total_amount,
        p_customer_name_snapshot,
        p_notes,
        p_resolved_schedule_id
    )
    RETURNING id, created_at
    INTO v_order_id, v_created_at;

    -- ============================================================
    -- Section 4 — INSERT batch order_items
    -- ============================================================
    -- `quantity` is SMALLINT on the column — explicit cast required.
    -- `options_snapshot` defaults to '{}' on the column; COALESCE here is
    -- belt-and-suspenders against a caller omitting the field.
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
        v_order_id,
        (item->>'product_id')::uuid,
        item->>'product_name_snapshot',
        (item->>'unit_price_snapshot')::numeric,
        (item->>'quantity')::smallint,
        (item->>'line_total')::numeric,
        COALESCE(item->'options_snapshot', '{}'::jsonb),
        item->>'item_notes'
    FROM jsonb_array_elements(p_items) AS item;

    -- ============================================================
    -- Section 5 — Touch customer_sessions.last_activity_at
    -- ============================================================
    -- Branch B "new group" already touched last_activity_at; this
    -- second UPDATE is idempotent and cheap inside the same transaction.
    UPDATE public.customer_sessions
       SET last_activity_at = now()
     WHERE id = p_customer_session_id;

    -- ============================================================
    -- Section 6 — Return payload
    -- ============================================================
    RETURN jsonb_build_object(
        'order_id',       v_order_id,
        'order_group_id', v_order_group_id,
        'status',         'submitted',
        'created_at',     v_created_at
    );
END;
$function$;
-- NOTE: grants are applied in companion migration 20260521172001
-- (split to avoid the Supabase CLI multi-statement prepared statement
-- limitation observed when CREATE FUNCTION + 4 REVOKE/GRANT are in
-- the same file).
COMMIT;
