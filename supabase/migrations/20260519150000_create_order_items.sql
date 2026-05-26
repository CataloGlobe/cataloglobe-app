-- =========================================
-- ORDERS EPIC — Phase 1.5: order_items (immutable line snapshots)
-- =========================================
-- One row per line within an `orders` ticket. Each row is a complete
-- snapshot of the product as it was at submit time: name, unit price,
-- chosen options and computed line total are all frozen — never mutated.
-- This guarantees that historical orders remain readable and auditable
-- even after the underlying product / options / prices evolve.
--
-- Immutability contract:
--   - No `updated_at`, no update trigger.
--   - The Edge Function `submit-order` is the sole writer. Once a row is
--     in, it stays as-is until the parent `orders` row is deleted
--     (CASCADE).
--
-- Schema choices worth calling out:
--   - No `tenant_id` column. The tenant is derived via JOIN on
--     `orders.tenant_id`. RLS policies below use a subquery against
--     `orders` accordingly.
--   - `product_id` is NULLABLE with ON DELETE SET NULL. Rationale:
--       * CASCADE would destroy order history when a menu item is removed.
--       * RESTRICT would block legitimate menu cleanup long-term.
--       * SET NULL preserves the snapshot fields (name / price / options)
--         so the line remains fully readable; only the link back to the
--         live product is severed. The Edge Function enforces NOT NULL
--         at INSERT time.
--   - No cross-column CHECK (e.g. `line_total = unit_price * quantity`):
--     `line_total` legitimately includes per-option surcharges encoded in
--     `options_snapshot` (jsonb), which is not expressible as a simple
--     arithmetic constraint. Calculation lives in the Edge Function.
--
-- RLS:
--   - Only tenant-scoped (authenticated/admin) policies are created here,
--     and they JOIN against `orders` to resolve tenancy.
--   - Anon (guest) policies are deferred to task 1.7.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name_snapshot text NOT NULL,
  unit_price_snapshot numeric(10, 2) NOT NULL CHECK (unit_price_snapshot >= 0),
  quantity smallint NOT NULL CHECK (quantity > 0),
  line_total numeric(10, 2) NOT NULL CHECK (line_total >= 0),
  options_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  item_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Primary access pattern: "all items of a given order".
CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);

-- Product-level analytics ("how often was this product ordered?").
-- Partial: only live links matter; orphaned snapshots (product_id NULL) are noise here.
CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON public.order_items (product_id)
  WHERE product_id IS NOT NULL;

-- =========================================
-- RLS — tenant-scoped (admin only)
-- =========================================
-- `order_items` has no direct `tenant_id`. Tenancy is resolved via JOIN
-- on `orders`. Anon (guest) policies are deferred to task 1.7.
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.order_items;
CREATE POLICY "Tenant select own rows"
ON public.order_items
FOR SELECT
TO authenticated
USING (order_id IN (
  SELECT id FROM public.orders
  WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.order_items;
CREATE POLICY "Tenant insert own rows"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (order_id IN (
  SELECT id FROM public.orders
  WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.order_items;
CREATE POLICY "Tenant update own rows"
ON public.order_items
FOR UPDATE
TO authenticated
USING (order_id IN (
  SELECT id FROM public.orders
  WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
))
WITH CHECK (order_id IN (
  SELECT id FROM public.orders
  WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.order_items;
CREATE POLICY "Tenant delete own rows"
ON public.order_items
FOR DELETE
TO authenticated
USING (order_id IN (
  SELECT id FROM public.orders
  WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
));

COMMIT;
