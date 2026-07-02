-- ============================================================================
-- RPC: get_rectifiable_residual
-- ----------------------------------------------------------------------------
-- Exposes, per parent order line, the residual quantity still stornabile
-- (rectifiable) together with the amount already stornato. Single source of
-- truth: the residual math is IDENTICAL to the cumulative cap enforced inside
-- rectify_order_atomic (see 20260622120000_rectify_order_atomic_delivered_only.sql,
-- Section 3 Pass B) so the form can never drift from what the RPC will accept.
--
-- Match key = order_items.parent_order_item_id (FK row->row lineage added by
-- 20260619160000_add_parent_order_item_id_to_order_items.sql). Pure UUID
-- equality, no name normalization.
--
-- Formula per line:
--   r_original_qty  = oi.quantity
--   r_rectified_qty = COALESCE(SUM(storno.quantity), 0) over NON-cancelled
--                     rectifications of this parent, keyed by parent_order_item_id
--   r_residual_qty  = GREATEST(original - rectified, 0)
--
-- Tenant guard (mirrors import_products_into_catalog, 20260630120000): this
-- function is SECURITY DEFINER and bypasses RLS, so the caller's access is
-- verified explicitly BEFORE any row is returned:
--   (a) caller must belong to the order's tenant  [get_my_tenant_ids, mirrors RLS]
--   (b) caller must hold 'orders.read' on that tenant
--       [has_permission_any_activity, tenant-bound — has_permission(text,uuid)
--        would leak across tenants for a multi-tenant member].
--
-- The r_* output prefix avoids the RETURNS TABLE <-> table column alias
-- collision (CLAUDE.md plpgsql guardrail); RETURN QUERY selects that never
-- reference those names by identifier keep the body collision-free anyway.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_rectifiable_residual(p_order_id uuid)
RETURNS TABLE(
    r_order_item_id  uuid,
    r_product_name   text,
    r_original_qty   integer,
    r_rectified_qty  integer,
    r_residual_qty   integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Resolve the order's tenant. A NULL means the order does not exist.
    SELECT o.tenant_id
      INTO v_tenant_id
      FROM public.orders o
     WHERE o.id = p_order_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: order % does not exist', p_order_id
            USING errcode = 'P0002';
    END IF;

    -- (a) membership gate — mirrors the RLS tenant_id IN get_my_tenant_ids().
    IF NOT (v_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'tenant % not accessible to caller', v_tenant_id
            USING errcode = '42501';
    END IF;

    -- (b) permission gate — tenant-bound orders.read.
    IF NOT public.has_permission_any_activity('orders.read', v_tenant_id) THEN
        RAISE EXCEPTION 'permission denied: orders.read on tenant %', v_tenant_id
            USING errcode = '42501';
    END IF;

    RETURN QUERY
    SELECT
        oi.id,
        oi.product_name_snapshot,
        oi.quantity::integer,
        s.rectified,
        GREATEST(oi.quantity - s.rectified, 0)::integer
    FROM public.order_items oi
    CROSS JOIN LATERAL (
        -- VERBATIM cap subquery from rectify_order_atomic (20260622120000,
        -- Section 3): sum of prior, non-cancelled rectification lines of this
        -- parent, keyed by the parent_order_item_id lineage column.
        SELECT COALESCE(SUM(soi.quantity), 0)::integer AS rectified
          FROM public.order_items soi
          JOIN public.orders so ON so.id = soi.order_id
         WHERE so.parent_order_id = p_order_id
           AND so.is_rectification = true
           AND so.cancelled_at IS NULL
           AND soi.parent_order_item_id = oi.id
    ) s
    WHERE oi.order_id = p_order_id;
END;
$$;

-- SECURITY DEFINER: strip default grants (Supabase pre-grants anon too), expose
-- only to authenticated. This is an admin-side read; customers never call it.
REVOKE ALL ON FUNCTION public.get_rectifiable_residual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_rectifiable_residual(uuid) TO authenticated;
