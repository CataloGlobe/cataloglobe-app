-- =============================================================================
-- Reconstruct missing CREATE TABLE definitions for 4 tables originally
-- created via Supabase Studio.
--
-- Empty stubs:
--   20260225203003_v2_product_groups.sql
--   20260225220320_v2_product_options.sql
--
-- This file is placed immediately after those stubs (timestamp +1s) so that,
-- on a fresh database replay, these tables exist before the ALTER TABLE
-- statements in 20260228174000_v2_product_options_multiprice.sql run.
--
-- All DDL uses IF NOT EXISTS — safe to apply against the live database
-- where these tables already exist.
--
-- Columns reflect the INITIAL schema as inferred from TypeScript types and
-- service-layer queries.  The group_kind / pricing_mode / absolute_price
-- columns are intentionally NOT included here; they are added by
-- 20260228174000_v2_product_options_multiprice.sql via ADD COLUMN IF NOT EXISTS.
--
-- RLS: tables are marked ENABLE ROW LEVEL SECURITY.
-- Policies are NOT created here.  The dynamic block in
-- 20260309100000_v2_phase2_rls_multi_tenant.sql discovers all v2_* tables
-- with a tenant_id column at runtime and installs the standard four-policy
-- set (get_my_tenant_ids()).
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. v2_product_option_groups
-- =============================================================================
--
-- Manages groups of selectable options attached to a product.
--
-- Two kinds (added in 20260228174000 via ALTER TABLE):
--   PRIMARY_PRICE — single-select price-point formats ("Formati")
--   ADDON         — optional add-on choices
--
-- Two pricing modes (added in 20260228174000 via ALTER TABLE):
--   ABSOLUTE — each option value carries a standalone price
--   DELTA    — each option value carries a relative price modifier
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_product_option_groups (
    id             uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id      uuid        NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    product_id     uuid        NOT NULL REFERENCES public.v2_products(id) ON DELETE CASCADE,
    name           text        NOT NULL,
    is_required    boolean     NOT NULL DEFAULT false,
    max_selectable integer,
    -- group_kind and pricing_mode are added by 20260228174000 (ADD COLUMN IF NOT EXISTS)
    created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_product_option_groups ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 2. v2_product_option_values
-- =============================================================================
--
-- Individual selectable values within an option group.
--
--   price_modifier  — relative delta on top of the product base_price;
--                     used when the parent group pricing_mode = 'DELTA'
--   absolute_price  — standalone price for this option value;
--                     added by 20260228174000 (ADD COLUMN IF NOT EXISTS);
--                     used when the parent group pricing_mode = 'ABSOLUTE'
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_product_option_values (
    id              uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       uuid         NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    option_group_id uuid         NOT NULL REFERENCES public.v2_product_option_groups(id) ON DELETE CASCADE,
    name            text         NOT NULL,
    price_modifier  numeric(10,2),
    -- absolute_price is added by 20260228174000 (ADD COLUMN IF NOT EXISTS)
    created_at      timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_product_option_values ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 3. v2_product_groups
-- =============================================================================
--
-- Named groups for organising products (e.g. "Antipasti", "Dessert").
--
-- Supports one level of nesting: root groups (parent_group_id IS NULL)
-- may have child sub-groups.  Maximum depth of 1 is enforced in application
-- logic, not at the database level.
--
-- NOTE: updated_at is present in the TypeScript type (ProductGroup) but the
-- service layer does not explicitly set it on update.  A trigger using
-- update_updated_at_column() likely exists on the live database (created via
-- Studio) but is not documented in any migration file.  See audit report.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_product_groups (
    id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       uuid        NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    name            text        NOT NULL,
    parent_group_id uuid        REFERENCES public.v2_product_groups(id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.v2_product_groups ENABLE ROW LEVEL SECURITY;

-- Trigger for updated_at maintenance.
-- CREATE OR REPLACE is used to be idempotent on the live database.
-- If update_updated_at_column() is not available (e.g. very fresh DB with no
-- prior migrations), this will error — install the function first or remove
-- this block and rely on the Studio-created trigger being present.
CREATE OR REPLACE TRIGGER v2_product_groups_set_updated_at
    BEFORE UPDATE ON public.v2_product_groups
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4. v2_product_group_items
-- =============================================================================
--
-- Junction table: many-to-many between products and groups.
-- A product can belong to multiple groups; a group contains many products.
--
-- No surrogate key.  Composite PK (tenant_id, product_id, group_id) prevents
-- duplicate assignments and serves as the natural unique constraint.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.v2_product_group_items (
    tenant_id  uuid        NOT NULL REFERENCES public.v2_tenants(id)  ON DELETE CASCADE,
    product_id uuid        NOT NULL REFERENCES public.v2_products(id) ON DELETE CASCADE,
    group_id   uuid        NOT NULL REFERENCES public.v2_product_groups(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, product_id, group_id)
);

ALTER TABLE public.v2_product_group_items ENABLE ROW LEVEL SECURITY;

COMMIT;
