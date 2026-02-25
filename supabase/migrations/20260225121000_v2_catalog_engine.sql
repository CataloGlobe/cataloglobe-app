-- =========================================================================
-- V2 Catalog Engine
-- =========================================================================

-- 1. CATALOGS
-- The root entity containing categories and products
CREATE TABLE IF NOT EXISTS public.v2_catalogs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.v2_catalogs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own catalogs" 
ON public.v2_catalogs
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to catalogs" 
ON public.v2_catalogs 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);


-- 2. CATALOG CATEGORIES
-- Hierarchical structure (max 3 levels)
CREATE TABLE IF NOT EXISTS public.v2_catalog_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    catalog_id UUID NOT NULL REFERENCES public.v2_catalogs(id) ON DELETE CASCADE,
    parent_category_id UUID REFERENCES public.v2_catalog_categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    level INT NOT NULL CHECK (level IN (1, 2, 3)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS
ALTER TABLE public.v2_catalog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own catalog categories" 
ON public.v2_catalog_categories
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to catalog categories" 
ON public.v2_catalog_categories 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Indices
CREATE INDEX idx_v2_catalog_cat_catalog ON public.v2_catalog_categories(catalog_id);
CREATE INDEX idx_v2_catalog_cat_parent ON public.v2_catalog_categories(parent_category_id);
CREATE INDEX idx_v2_catalog_cat_tenant ON public.v2_catalog_categories(tenant_id);


-- 3. CATALOG CATEGORY PRODUCTS
-- Links products to categories
CREATE TABLE IF NOT EXISTS public.v2_catalog_category_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    catalog_id UUID NOT NULL REFERENCES public.v2_catalogs(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES public.v2_catalog_categories(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.v2_products(id) ON DELETE CASCADE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure a product can't be added twice to the exact same category
    UNIQUE(category_id, product_id)
);

-- RLS
ALTER TABLE public.v2_catalog_category_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own catalog category products" 
ON public.v2_catalog_category_products
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to catalog category products" 
ON public.v2_catalog_category_products 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Indices
CREATE INDEX idx_v2_catalog_prod_catalog ON public.v2_catalog_category_products(catalog_id);
CREATE INDEX idx_v2_catalog_prod_category ON public.v2_catalog_category_products(category_id);
CREATE INDEX idx_v2_catalog_prod_product ON public.v2_catalog_category_products(product_id);
CREATE INDEX idx_v2_catalog_prod_tenant ON public.v2_catalog_category_products(tenant_id);
