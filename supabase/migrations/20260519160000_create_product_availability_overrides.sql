-- =========================================
-- ORDERS EPIC — Phase 1.6: product_availability_overrides
-- =========================================
-- Per-activity override of product availability. The default for any
-- (activity, product) pair is "available"; this table only stores
-- exceptions to that default — typically set by an admin during service
-- ("orata sold out tonight") or for indefinite removals ("dish out of
-- season").
--
-- Reset scope is explicit:
--   - `auto_reset_at = tomorrow 04:00 UTC` → nightly cron flips it back
--     (task 1.10) so the kitchen starts fresh each day.
--   - `auto_reset_at = NULL` → indefinite; only an admin re-enables it.
--
-- Resolver semantics (in `resolve-public-catalog` and `submit-order`):
--   - No row for (activity_id, product_id)  → product is available (default).
--   - Row with available = false            → product is NOT available here.
--   - Row with available = true             → available (post-reset leftover).
--
-- Schema choices worth calling out:
--   - `product_id ON DELETE CASCADE` (unlike `order_items.product_id` which
--     uses SET NULL): this row is live configuration, not an audit snapshot,
--     so it should disappear with the product.
--   - `disabled_by` references `auth.users(id)`. The `auth` schema is
--     provided by Supabase Auth and is always present in the project.
--   - `UNIQUE (activity_id, product_id)`: at most one override per pair;
--     toggling is an UPSERT in the Edge Function.
--   - No cross-column CHECK (e.g. `available = true OR disabled_at IS NOT NULL`):
--     consistency is the toggle Edge Function's job. DB-side rigidity here
--     would risk legitimate writes failing in unexpected ways.
--   - No anon RLS — neither here nor in task 1.7. Guest clients never read
--     this table directly; availability is resolved server-side by the
--     public catalog resolver.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_availability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  available boolean NOT NULL DEFAULT true,
  disabled_at timestamptz,
  disabled_reason text,
  auto_reset_at timestamptz,
  disabled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, product_id)
);

-- Tenant + activity lookup (admin list view: "all overrides for this venue").
CREATE INDEX IF NOT EXISTS idx_pao_tenant_activity
  ON public.product_availability_overrides (tenant_id, activity_id);

-- Hot path: resolver asks "what is unavailable in this activity?".
-- Default state is `available = true`, so a partial index keeps the index
-- focused on the exception rows only.
CREATE INDEX IF NOT EXISTS idx_pao_unavailable
  ON public.product_availability_overrides (activity_id, product_id)
  WHERE available = false;

-- Nightly cron sweep (task 1.10): find rows whose reset window has elapsed.
CREATE INDEX IF NOT EXISTS idx_pao_auto_reset
  ON public.product_availability_overrides (auto_reset_at)
  WHERE auto_reset_at IS NOT NULL;

-- Keep updated_at in sync (reuses existing helper).
DROP TRIGGER IF EXISTS product_availability_overrides_set_updated_at
  ON public.product_availability_overrides;
CREATE TRIGGER product_availability_overrides_set_updated_at
  BEFORE UPDATE ON public.product_availability_overrides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- RLS — tenant-scoped (admin only)
-- =========================================
-- Admin-only table. Guest clients never touch this directly; the public
-- catalog resolver applies availability server-side. No anon policies will
-- be added here, ever.
ALTER TABLE public.product_availability_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_availability_overrides;
CREATE POLICY "Tenant select own rows"
ON public.product_availability_overrides
FOR SELECT
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_availability_overrides;
CREATE POLICY "Tenant insert own rows"
ON public.product_availability_overrides
FOR INSERT
TO authenticated
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_availability_overrides;
CREATE POLICY "Tenant update own rows"
ON public.product_availability_overrides
FOR UPDATE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_availability_overrides;
CREATE POLICY "Tenant delete own rows"
ON public.product_availability_overrides
FOR DELETE
TO authenticated
USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

COMMIT;
