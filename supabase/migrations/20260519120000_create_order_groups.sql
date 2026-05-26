-- =========================================
-- ORDERS EPIC — Phase 1.2: order_groups (shared bill per table)
-- =========================================
-- One open `order_group` represents a shared bill currently active on a
-- physical table. Multiple `customer_sessions` (created in a later task)
-- may opt-in to the same group ("ordinare insieme") or stay separate
-- (`order_group_id = NULL`, split bill).
--
-- Lifecycle:
--   - `status = 'open'`  → bill is active; new sessions can join.
--   - `status = 'closed'` + `closed_at` set → admin closed the table.
--     A subsequent scan creates a brand-new `order_group`.
--
-- Notes:
--   - `table_id` uses ON DELETE RESTRICT: a `table` with order history
--     cannot be hard-deleted (the table itself is soft-deleted via
--     `deleted_at`, defined in migration 20260518150000_create_tables.sql).
--   - No FKs from `customer_sessions` / `orders` here — those tables do
--     not exist yet; they will reference `order_groups` themselves.
--   - Trigger reuses the existing `public.set_updated_at()` helper.

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES public.tables(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant + activity lookup (admin list view).
CREATE INDEX IF NOT EXISTS idx_order_groups_tenant_activity
  ON public.order_groups (tenant_id, activity_id);

-- Per-table lookup (history of bills on a table).
CREATE INDEX IF NOT EXISTS idx_order_groups_table
  ON public.order_groups (table_id);

-- Hot path: "which group is currently open on this table?"
CREATE INDEX IF NOT EXISTS idx_order_groups_open
  ON public.order_groups (table_id, status)
  WHERE status = 'open';

-- Keep updated_at in sync (reuses existing helper).
DROP TRIGGER IF EXISTS order_groups_set_updated_at ON public.order_groups;
CREATE TRIGGER order_groups_set_updated_at
  BEFORE UPDATE ON public.order_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS
-- =========================================
ALTER TABLE public.order_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.order_groups;
CREATE POLICY "Tenant select own rows"
ON public.order_groups
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.order_groups;
CREATE POLICY "Tenant insert own rows"
ON public.order_groups
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.order_groups;
CREATE POLICY "Tenant update own rows"
ON public.order_groups
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.order_groups;
CREATE POLICY "Tenant delete own rows"
ON public.order_groups
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
