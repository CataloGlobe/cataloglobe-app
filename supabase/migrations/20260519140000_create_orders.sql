-- =========================================
-- ORDERS EPIC — Phase 1.4: orders (immutable tickets)
-- =========================================
-- One row per "submit" action by a guest. An order is an immutable ticket:
-- once created, only its `status` (and the matching `*_at` timestamp) is
-- updated through controlled transitions, each bumping `version` for
-- optimistic locking. The financial / item content never changes.
--
-- Post-acknowledged corrections are modeled as separate "rectification"
-- orders pointing at the original via `parent_order_id` and flagged with
-- `is_rectification = true`. Bill total is therefore computed as:
--   SUM(total_amount) WHERE NOT is_rectification
--   - SUM(total_amount) WHERE is_rectification
--
-- Status lifecycle (text + CHECK, not enum, to allow non-breaking extension
-- in Phase 3 KDS: `in_preparation`, `ready`):
--   submitted → acknowledged → delivered
--                ↘ cancelled  (also reachable from submitted)
--
-- FK choices:
--   - tenant_id / activity_id CASCADE: tenant lifecycle owns everything.
--   - table_id RESTRICT: a table with order history cannot be hard-deleted
--     (soft-delete via `deleted_at` is the documented path).
--   - customer_session_id RESTRICT: an order cannot lose the identity that
--     produced it; customer_sessions outlive their TTL as historical rows
--     until purge respects existing FK references.
--   - order_group_id SET NULL: losing the shared-bill grouping is tolerated;
--     the order itself stays.
--   - parent_order_id RESTRICT (self-reference): a parent order cannot be
--     hard-deleted while rectifications still reference it.
--   - resolved_schedule_id SET NULL: pure audit/debug pointer; safe to drop.
--
-- Notes:
--   - Cross-column CHECKs (e.g. status='cancelled' ⇒ cancelled_at NOT NULL)
--     are intentionally NOT added: state-machine integrity is enforced by
--     the Edge Functions handling transitions. DB-side rigidity here would
--     risk legitimate writes failing in unexpected ways.
--   - Only tenant-scoped (authenticated/admin) RLS policies are created here.
--     Anon-side policies (guest with custom JWT) come in task 1.7.
--   - Trigger reuses the existing `public.set_updated_at()` helper.

BEGIN;

CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  customer_session_id uuid NOT NULL REFERENCES public.customer_sessions(id) ON DELETE RESTRICT,
  order_group_id uuid REFERENCES public.order_groups(id) ON DELETE SET NULL,
  parent_order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  is_rectification boolean NOT NULL DEFAULT false,
  customer_name_snapshot text,
  status text NOT NULL CHECK (status IN ('submitted', 'acknowledged', 'delivered', 'cancelled')),
  version int NOT NULL DEFAULT 1,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by text CHECK (cancelled_by IN ('customer', 'admin') OR cancelled_by IS NULL),
  cancellation_reason text,
  notes text,
  total_amount numeric(10, 2) NOT NULL CHECK (total_amount >= 0),
  currency char(3) NOT NULL DEFAULT 'EUR',
  resolved_schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant + activity lookup (admin list view).
CREATE INDEX IF NOT EXISTS idx_orders_tenant_activity
  ON public.orders (tenant_id, activity_id);

-- Per-table filtered-by-status lookup (admin per-table view).
CREATE INDEX IF NOT EXISTS idx_orders_table_status
  ON public.orders (table_id, status);

-- Guest "my orders" lookup.
CREATE INDEX IF NOT EXISTS idx_orders_session
  ON public.orders (customer_session_id);

-- Shared-bill aggregation.
CREATE INDEX IF NOT EXISTS idx_orders_group
  ON public.orders (order_group_id)
  WHERE order_group_id IS NOT NULL;

-- Rectifications of a given parent order.
CREATE INDEX IF NOT EXISTS idx_orders_parent
  ON public.orders (parent_order_id)
  WHERE parent_order_id IS NOT NULL;

-- Hot path: live admin dashboard ("what's open right now?").
CREATE INDEX IF NOT EXISTS idx_orders_active
  ON public.orders (activity_id, status)
  WHERE status IN ('submitted', 'acknowledged');

-- Chronological ordering (most-recent-first lists).
CREATE INDEX IF NOT EXISTS idx_orders_submitted_at
  ON public.orders (submitted_at DESC);

-- Keep updated_at in sync (reuses existing helper).
DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS — tenant-scoped (admin only)
-- =========================================
-- Anon (guest) policies are deliberately deferred to task 1.7, where they
-- will be introduced together with the matching policies on `order_items`
-- and `customer_sessions`, using `public.get_jwt_customer_session_id()`.
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.orders;
CREATE POLICY "Tenant select own rows"
ON public.orders
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.orders;
CREATE POLICY "Tenant insert own rows"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.orders;
CREATE POLICY "Tenant update own rows"
ON public.orders
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.orders;
CREATE POLICY "Tenant delete own rows"
ON public.orders
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
