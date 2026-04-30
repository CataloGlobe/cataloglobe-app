-- =============================================================================
-- product_characteristics + product_characteristic_assignments
-- =============================================================================
--
-- New domain primitive parallel to allergens: platform-level lookup of
-- characteristics (diet, spicy, origin, preparation, warning, status) plus a
-- tenant-scoped join table to assign them to products.
--
-- Pattern reference: allergens (lookup, cross-tenant) + product_allergens
-- (join, tenant-scoped). Public read on both, writes on assignments via
-- get_my_tenant_ids(). Lookup writes only via service_role / migrations.
--
-- Refs: DESIGN_product_characteristics.md (root) sez. 2-4.
-- Decisions D1-D8 confermate prima di Fase 1b.
-- =============================================================================

BEGIN;

-- 1. LOOKUP TABLE (cross-tenant, system-managed)
CREATE TABLE public.product_characteristics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'diet', 'spicy', 'origin', 'preparation', 'warning', 'status'
    )),
    vertical TEXT NOT NULL CHECK (vertical IN (
        'food_beverage', 'retail', 'hotel', 'generic'
    )),
    label_it TEXT NOT NULL,
    label_en TEXT NOT NULL,
    icon TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    show_in_card BOOLEAN NOT NULL DEFAULT false,
    mutex_group TEXT,
    dietary_claim BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    UNIQUE (code, vertical)
);

CREATE INDEX idx_product_characteristics_vertical
    ON public.product_characteristics (vertical);

ALTER TABLE public.product_characteristics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read product_characteristics"
    ON public.product_characteristics
    FOR SELECT
    USING (true);

CREATE POLICY "Service role has full access to product_characteristics"
    ON public.product_characteristics
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);


-- 2. JOIN TABLE (tenant-scoped)
CREATE TABLE public.product_characteristic_assignments (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    characteristic_id UUID NOT NULL REFERENCES public.product_characteristics(id)
        ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    PRIMARY KEY (product_id, characteristic_id)
);

CREATE INDEX idx_pca_tenant_product
    ON public.product_characteristic_assignments (tenant_id, product_id);

ALTER TABLE public.product_characteristic_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant select own characteristic assignments"
    ON public.product_characteristic_assignments
    FOR SELECT
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant insert own characteristic assignments"
    ON public.product_characteristic_assignments
    FOR INSERT
    TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant update own characteristic assignments"
    ON public.product_characteristic_assignments
    FOR UPDATE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Tenant delete own characteristic assignments"
    ON public.product_characteristic_assignments
    FOR DELETE
    TO authenticated
    USING (tenant_id IN (SELECT public.get_my_tenant_ids()));

CREATE POLICY "Public can read product_characteristic_assignments"
    ON public.product_characteristic_assignments
    FOR SELECT
    TO anon
    USING (true);

CREATE POLICY "Service role has full access to product_characteristic_assignments"
    ON public.product_characteristic_assignments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

COMMIT;
