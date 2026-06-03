-- close_table_with_resolution: esecutore atomico per close-table con
-- risoluzione bulk degli ordini aperti.
--
-- DESIGN — separazione authz / esecuzione
-- ────────────────────────────────────────
-- Authorization (chi puo' chiudere un tavolo) RESTA nell'Edge Function
-- `close-table`: JWT validation + membership via `get_my_tenant_ids()`
-- sul client user-scoped. Questa RPC NON contiene gate auth (no
-- `auth.uid()`, no `has_permission(...)`). Il pattern e' identico
-- al confine attuale di close-table — il cambiamento qui e' SOLO
-- l'atomicita' di esecuzione.
--
-- La RPC e' callable SOLO da `service_role` (REVOKE FROM PUBLIC + anon
-- + authenticated; GRANT TO service_role). Frontend e clienti non
-- possono invocarla direttamente. L'Edge Function la chiama dopo aver
-- validato authz e passa il `p_tenant_id` derivato server-side dal
-- record `tables` (mai dal client) come difesa in profondita' nel
-- WHERE bulk-UPDATE.
--
-- ATOMICITA'
-- ──────────
-- Tutta la sequenza (resolve aperti + close groups + clear
-- bill_requested_at) vive in una sola tx Postgres implicita della RPC.
-- Crash mid-way -> rollback completo, niente stati intermedi
-- (gruppi chiusi con orders ancora aperti).
--
-- BULK UPDATE — perche' bypassa optimistic locking ordini
-- ──────────────────────────────────────────────────────
-- Lo `expected_version` per-ordine sarebbe ingestibile in una mutazione
-- in blocco. Il filtro `status IN (submitted, acknowledged, ready)` e'
-- la safety: ordini che nel frattempo sono diventati terminali
-- (`delivered` / `cancelled`) non vengono toccati. Il filtro
-- `tenant_id` e' defense-in-depth (l'Edge gia' valida membership; qui
-- aggiunge una barriera SQL-side contro bug futuri).
--
-- AZIONI
-- ──────
--   'none'     → non risolve nulla; se ci sono aperti la fn RAISE
--                 con SQLSTATE 'P0001' + messaggio
--                 "TABLE_HAS_OPEN_ORDERS:N". L'Edge fn mappa a 409.
--   'deliver'  → orders aperti → delivered, delivered_at=now(),
--                 version+=1, updated_at=now(). Non tocca
--                 acknowledged_at / ready_at (preservati come da
--                 deliver-order).
--   'cancel'   → orders aperti → cancelled, cancelled_at=now(),
--                 cancelled_by='admin',
--                 cancellation_reason='Chiusura tavolo',
--                 version+=1, updated_at=now(). Non tocca
--                 acknowledged_at / ready_at (preservati come da
--                 cancel-order-admin).
--
-- RETURN
-- ──────
-- jsonb {
--   table_id, resolved_action, resolved_orders_count,
--   closed_groups_count, closed_orders_count, cleared_bill_count
-- }
--
-- ERRORI (RAISE EXCEPTION)
--   - 'TABLE_NOT_FOUND'        — tavolo inesistente o soft-deleted
--   - 'TENANT_MISMATCH'        — p_tenant_id non corrisponde al tavolo
--   - 'INVALID_ACTION'         — p_action fuori whitelist
--   - 'TABLE_HAS_OPEN_ORDERS:N' — p_action='none' con N>0 aperti

CREATE OR REPLACE FUNCTION public.close_table_with_resolution(
    p_table_id uuid,
    p_tenant_id uuid,
    p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_table_tenant_id uuid;
    v_table_deleted_at timestamptz;
    v_now timestamptz := now();
    v_open_count int;
    v_resolved_count int;
    v_closed_group_ids uuid[];
    v_closed_orders_count int := 0;
    v_cleared_bill_count int := 0;
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

    RETURN jsonb_build_object(
        'table_id', p_table_id,
        'resolved_action', p_action,
        'resolved_orders_count', v_resolved_count,
        'closed_groups_count', COALESCE(array_length(v_closed_group_ids, 1), 0),
        'closed_orders_count', v_closed_orders_count,
        'cleared_bill_count', v_cleared_bill_count
    );
END;
$$;

COMMENT ON FUNCTION public.close_table_with_resolution(uuid, uuid, text) IS
    'Esecutore atomico per close-table con risoluzione bulk degli '
    'ordini aperti. Callable SOLO da service_role: l''authz (chi puo'' '
    'chiudere) resta nell''Edge Function close-table via JWT + '
    'get_my_tenant_ids(). Vedi commento header nella migration.';

REVOKE EXECUTE ON FUNCTION public.close_table_with_resolution(uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.close_table_with_resolution(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.close_table_with_resolution(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.close_table_with_resolution(uuid, uuid, text) TO service_role;
