-- =============================================================================
-- Variants V2 — Matrix Schema
-- =============================================================================
--
-- Adds the foundational data layer for matrix-style product variants.
-- No UI, no service functions, no backfill, no complex triggers.
--
-- Changes:
--   1.  products.variant_strategy         — new column (DEFAULT 'manual')
--   2.  product_variant_dimensions        — new table
--   3.  product_variant_dimension_values  — new table
--   4.  product_variant_assignments       — new table + coherence trigger
--   5.  product_variant_assignment_values — new table (junction)
--   6.  RLS policies on all new tables
--
-- Naming conventions:
--   - Table names: no v2_ prefix (matches live DB: products, product_option_groups, ...)
--   - Tenant FK: references public.tenants(id)
--   - Policy names: "Tenant select/insert/update/delete own rows" (project standard)
--   - RLS expression: tenant_id IN (SELECT public.get_my_tenant_ids())
--
-- combination_key format (enforced by service layer, documented here):
--   Sorted array of dimension_value UUIDs joined with ':'.
--   Example for 2 dimensions: '<smaller_uuid>:<larger_uuid>'
--   Sorting is lexicographic on the UUID text representation.
--   This guarantees the same combination always produces the same key,
--   regardless of insertion order.
--
-- Guardrails in this migration (DB-level):
--   HARD: UNIQUE (product_id, name)                        on dimensions
--   HARD: UNIQUE (dimension_id, label)                     on dimension_values
--   HARD: UNIQUE (parent_product_id, variant_product_id)   on assignments
--   HARD: UNIQUE (parent_product_id, combination_key)      on assignments
--   HARD: trigger trg_check_variant_assignment             — variant must belong to parent
--
-- Guardrails intentionally left to the service layer:
--   SOFT: max 2 dimensions per product
--   SOFT: parent must have parent_product_id IS NULL
--   SOFT: combination_key value construction and correctness
--
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. products.variant_strategy
-- =============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_strategy TEXT NOT NULL DEFAULT 'manual';

-- Add CHECK constraint idempotently (same pattern as product_type_fix migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname    = 'products_variant_strategy_check'
      AND  conrelid   = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_variant_strategy_check
      CHECK (variant_strategy IN ('manual', 'matrix'));
  END IF;
END;
$$;

-- =============================================================================
-- 2. product_variant_dimensions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_variant_dimensions (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id  UUID        NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_variant_dimensions_product_name_key
    UNIQUE (product_id, name)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_dimensions_product_id
  ON public.product_variant_dimensions (product_id);

CREATE INDEX IF NOT EXISTS idx_product_variant_dimensions_tenant_id
  ON public.product_variant_dimensions (tenant_id);

-- =============================================================================
-- 3. product_variant_dimension_values
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_variant_dimension_values (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES public.tenants(id)                  ON DELETE CASCADE,
  dimension_id UUID        NOT NULL REFERENCES public.product_variant_dimensions(id)  ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_variant_dimension_values_dimension_label_key
    UNIQUE (dimension_id, label)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_dimension_values_dimension_id
  ON public.product_variant_dimension_values (dimension_id);

CREATE INDEX IF NOT EXISTS idx_product_variant_dimension_values_tenant_id
  ON public.product_variant_dimension_values (tenant_id);

-- =============================================================================
-- 4. product_variant_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.product_variant_assignments (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID        NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  parent_product_id  UUID        NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  variant_product_id UUID        NOT NULL REFERENCES public.products(id)   ON DELETE CASCADE,
  -- combination_key: sorted dimension_value UUIDs joined with ':' (see header comment)
  combination_key    TEXT        NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT product_variant_assignments_parent_variant_key
    UNIQUE (parent_product_id, variant_product_id),

  CONSTRAINT product_variant_assignments_parent_combination_key
    UNIQUE (parent_product_id, combination_key)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_assignments_parent_id
  ON public.product_variant_assignments (parent_product_id);

CREATE INDEX IF NOT EXISTS idx_product_variant_assignments_variant_id
  ON public.product_variant_assignments (variant_product_id);

-- -----------------------------------------------------------------------------
-- Trigger: verify variant_product_id actually belongs to parent_product_id
-- -----------------------------------------------------------------------------
-- This is a minimal coherence check. The existing trigger trg_check_v2_product_variant
-- on products already enforces max depth 1 and cross-tenant protection.
-- This trigger adds the forward-FK check that the assignment is consistent.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_check_variant_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_actual_parent UUID;
BEGIN
  SELECT parent_product_id
  INTO   v_actual_parent
  FROM   public.products
  WHERE  id = NEW.variant_product_id;

  -- If the product doesn't exist the FK constraint will fire; be explicit anyway.
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'variant_product_id % does not exist in products',
      NEW.variant_product_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- The variant must have parent_product_id = the parent we are assigning to.
  IF v_actual_parent IS DISTINCT FROM NEW.parent_product_id THEN
    RAISE EXCEPTION
      'Coherence violation: product % has parent_product_id = %, but assignment references parent %.',
      NEW.variant_product_id, v_actual_parent, NEW.parent_product_id
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_variant_assignment_trigger
  ON public.product_variant_assignments;

CREATE TRIGGER check_variant_assignment_trigger
  BEFORE INSERT OR UPDATE
  ON public.product_variant_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_check_variant_assignment();

-- =============================================================================
-- 5. product_variant_assignment_values
-- =============================================================================
-- Junction table linking an assignment to the specific dimension_value IDs
-- that form its combination. No tenant_id column: RLS is enforced via
-- a subquery on the parent product_variant_assignments table.

CREATE TABLE IF NOT EXISTS public.product_variant_assignment_values (
  assignment_id       UUID NOT NULL REFERENCES public.product_variant_assignments(id)       ON DELETE CASCADE,
  dimension_value_id  UUID NOT NULL REFERENCES public.product_variant_dimension_values(id)  ON DELETE RESTRICT,

  PRIMARY KEY (assignment_id, dimension_value_id)
);

CREATE INDEX IF NOT EXISTS idx_product_variant_assignment_values_dim_value_id
  ON public.product_variant_assignment_values (dimension_value_id);

-- =============================================================================
-- 6. Row-Level Security
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6a. product_variant_dimensions
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_variant_dimensions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_variant_dimensions;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_dimensions;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_dimensions;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_dimensions;

CREATE POLICY "Tenant select own rows"
  ON public.product_variant_dimensions
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.product_variant_dimensions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.product_variant_dimensions
  FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.product_variant_dimensions
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- -----------------------------------------------------------------------------
-- 6b. product_variant_dimension_values
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_variant_dimension_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_variant_dimension_values;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_dimension_values;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_dimension_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_dimension_values;

CREATE POLICY "Tenant select own rows"
  ON public.product_variant_dimension_values
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.product_variant_dimension_values
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.product_variant_dimension_values
  FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.product_variant_dimension_values
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- -----------------------------------------------------------------------------
-- 6c. product_variant_assignments
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_variant_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_variant_assignments;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_assignments;
DROP POLICY IF EXISTS "Tenant update own rows" ON public.product_variant_assignments;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_assignments;

CREATE POLICY "Tenant select own rows"
  ON public.product_variant_assignments
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own rows"
  ON public.product_variant_assignments
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own rows"
  ON public.product_variant_assignments
  FOR UPDATE TO authenticated
  USING  (tenant_id IN (SELECT public.get_my_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own rows"
  ON public.product_variant_assignments
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

-- -----------------------------------------------------------------------------
-- 6d. product_variant_assignment_values
-- No tenant_id column — RLS via subquery on product_variant_assignments.
-- -----------------------------------------------------------------------------

ALTER TABLE public.product_variant_assignment_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant select own rows" ON public.product_variant_assignment_values;
DROP POLICY IF EXISTS "Tenant insert own rows" ON public.product_variant_assignment_values;
DROP POLICY IF EXISTS "Tenant delete own rows" ON public.product_variant_assignment_values;

CREATE POLICY "Tenant select own rows"
  ON public.product_variant_assignment_values
  FOR SELECT TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM public.product_variant_assignments
      WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

CREATE POLICY "Tenant insert own rows"
  ON public.product_variant_assignment_values
  FOR INSERT TO authenticated
  WITH CHECK (
    assignment_id IN (
      SELECT id FROM public.product_variant_assignments
      WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

-- No UPDATE policy: assignment values are immutable once written.
-- To change a combination, delete the assignment and recreate it.

CREATE POLICY "Tenant delete own rows"
  ON public.product_variant_assignment_values
  FOR DELETE TO authenticated
  USING (
    assignment_id IN (
      SELECT id FROM public.product_variant_assignments
      WHERE tenant_id IN (SELECT public.get_my_tenant_ids())
    )
  );

COMMIT;
