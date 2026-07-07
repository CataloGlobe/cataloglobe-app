-- Adds verification-mode support + anti-burst cap to submit_order_atomic.
-- Delta A: new order_groups (Branch B, no existing open group) now set
-- verified_at = now() immediately when the activity's ordering_verification_mode
-- is 'none' (no staff ack required); otherwise verified_at stays NULL until an
-- admin transition (e.g. acknowledge) verifies it.
-- Delta B: before inserting the order, cap at 5 'submitted' orders per
-- UNVERIFIED group to limit remote flooding before staff notices; the first
-- acknowledge (which sets verified_at) unblocks a real table.
-- Base body copied verbatim from 20260703093000_fix_submit_order_atomic_row_count.sql
-- (v_idem_inserted stays INTEGER — do not regress to boolean, see that file's header).
-- CREATE OR REPLACE on the same 11-arg signature preserves existing grants.
-- One command, no BEGIN;/COMMIT; wrapper (db-push single-prepared-statement rule).
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
    p_target_group_id        uuid,
    p_idempotency_key        text DEFAULT NULL
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
    v_idem_inserted             integer := 0;
    v_existing_order_id         uuid;
    v_verify_mode               text;
    v_unverified                boolean;
    v_group_order_count         integer;
BEGIN
    -- Section 0 — Idempotency claim (only if a key was supplied) ---------------
    IF p_idempotency_key IS NOT NULL THEN
        INSERT INTO public.order_idempotency_keys (tenant_id, customer_session_id, idempotency_key)
        VALUES (p_tenant_id, p_customer_session_id, p_idempotency_key)
        ON CONFLICT (customer_session_id, idempotency_key) DO NOTHING;
        GET DIAGNOSTICS v_idem_inserted = ROW_COUNT;

        IF v_idem_inserted = 0 THEN
            SELECT k.order_id INTO v_existing_order_id
              FROM public.order_idempotency_keys k
             WHERE k.customer_session_id = p_customer_session_id
               AND k.idempotency_key = p_idempotency_key;

            IF v_existing_order_id IS NULL THEN
                RAISE EXCEPTION 'IDEMPOTENCY_IN_PROGRESS: duplicate submit in flight';
            END IF;

            SELECT o.order_group_id, o.created_at
              INTO v_order_group_id, v_created_at
              FROM public.orders o WHERE o.id = v_existing_order_id;

            RETURN jsonb_build_object(
                'order_id', v_existing_order_id, 'order_group_id', v_order_group_id,
                'status', 'submitted', 'created_at', v_created_at, 'idempotent_replay', true
            );
        END IF;
    END IF;

    -- Section 1 — Defensive parameter validation ------------------------------
    IF p_tenant_id IS NULL OR p_activity_id IS NULL OR p_table_id IS NULL
       OR p_customer_session_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_PARAMS: required id parameter is NULL' USING ERRCODE = '22023';
    END IF;
    IF p_total_amount IS NULL OR p_total_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_PARAMS: total_amount must be > 0' USING ERRCODE = '22023';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'INVALID_PARAMS: empty or invalid items array' USING ERRCODE = '22023';
    END IF;

    -- Section 2 — Resolve order_group_id --------------------------------------
    IF p_target_group_id IS NOT NULL THEN
        SELECT og.status, og.table_id, og.tenant_id
          INTO v_target_status, v_target_table_id, v_target_tenant_id
          FROM public.order_groups og WHERE og.id = p_target_group_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'GROUP_CONFLICT: target group not found'; END IF;
        IF v_target_status <> 'open' THEN RAISE EXCEPTION 'GROUP_CONFLICT: target group is closed'; END IF;
        IF v_target_table_id <> p_table_id THEN RAISE EXCEPTION 'GROUP_CONFLICT: target group belongs to different table'; END IF;
        IF v_target_tenant_id <> p_tenant_id THEN RAISE EXCEPTION 'GROUP_CONFLICT: target group belongs to different tenant'; END IF;
        v_order_group_id := p_target_group_id;
    ELSE
        SELECT cs.order_group_id INTO v_existing_session_group_id
          FROM public.customer_sessions cs WHERE cs.id = p_customer_session_id;
        IF v_existing_session_group_id IS NOT NULL THEN
            SELECT og.status INTO v_target_status
              FROM public.order_groups og WHERE og.id = v_existing_session_group_id;
            IF FOUND AND v_target_status = 'open' THEN
                v_order_group_id := v_existing_session_group_id;
            END IF;
        END IF;
        IF v_order_group_id IS NULL THEN
            -- verified_at depends on the activity's verification mode.
            SELECT a.ordering_verification_mode INTO v_verify_mode
              FROM public.activities a WHERE a.id = p_activity_id;

            INSERT INTO public.order_groups (tenant_id, activity_id, table_id, status, verified_at)
            VALUES (
                p_tenant_id, p_activity_id, p_table_id, 'open',
                CASE WHEN v_verify_mode = 'none' THEN now() ELSE NULL END
            )
            RETURNING id INTO v_order_group_id;

            UPDATE public.customer_sessions
               SET order_group_id = v_order_group_id, last_activity_at = now()
             WHERE id = p_customer_session_id;
        END IF;
    END IF;

    -- Anti-burst cap: at most 5 orders EVER queued in an UNVERIFIED group.
    -- Counts ALL orders (any status) so cancelling does NOT decrement the
    -- ceiling — otherwise a submit+cancel loop could flood indefinitely before
    -- staff notices. In an unverified group orders can only be 'submitted' or
    -- 'cancelled' (the first acknowledge sets verified_at → group becomes
    -- verified → this cap no longer applies). Constant = 5.
    SELECT og.verified_at IS NULL INTO v_unverified
      FROM public.order_groups og WHERE og.id = v_order_group_id;

    IF v_unverified THEN
        SELECT count(*) INTO v_group_order_count
          FROM public.orders o
         WHERE o.order_group_id = v_order_group_id;
        IF v_group_order_count >= 5 THEN
            RAISE EXCEPTION 'UNVERIFIED_GROUP_BURST: too many orders before verification'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Section 3 — INSERT orders -----------------------------------------------
    INSERT INTO public.orders (
        tenant_id, activity_id, table_id, customer_session_id, order_group_id,
        status, total_amount, customer_name_snapshot, notes, resolved_schedule_id
    ) VALUES (
        p_tenant_id, p_activity_id, p_table_id, p_customer_session_id, v_order_group_id,
        'submitted', p_total_amount, p_customer_name_snapshot, p_notes, p_resolved_schedule_id
    )
    RETURNING id, created_at INTO v_order_id, v_created_at;

    -- Section 3b — Backfill idempotency row with the new order_id -------------
    IF p_idempotency_key IS NOT NULL THEN
        UPDATE public.order_idempotency_keys
           SET order_id = v_order_id
         WHERE customer_session_id = p_customer_session_id
           AND idempotency_key = p_idempotency_key;
    END IF;

    -- Section 4 — INSERT batch order_items ------------------------------------
    INSERT INTO public.order_items (
        order_id, product_id, product_name_snapshot, unit_price_snapshot,
        quantity, line_total, options_snapshot, item_notes
    )
    SELECT v_order_id, (item->>'product_id')::uuid, item->>'product_name_snapshot',
        (item->>'unit_price_snapshot')::numeric, (item->>'quantity')::smallint,
        (item->>'line_total')::numeric, COALESCE(item->'options_snapshot', '{}'::jsonb), item->>'item_notes'
    FROM jsonb_array_elements(p_items) AS item;

    -- Section 5 — Touch session ----------------------------------------------
    UPDATE public.customer_sessions SET last_activity_at = now() WHERE id = p_customer_session_id;

    -- Section 6 — Return ------------------------------------------------------
    RETURN jsonb_build_object(
        'order_id', v_order_id, 'order_group_id', v_order_group_id,
        'status', 'submitted', 'created_at', v_created_at
    );
END;
$function$;
