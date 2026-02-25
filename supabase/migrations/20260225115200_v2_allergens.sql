-- =========================================================================
-- V2 Allergens
-- =========================================================================

-- 1. SYSTEM ALLERGENS TABLE
-- Stores the 14 official EU allergens
CREATE TABLE IF NOT EXISTS public.v2_allergens (
    id SMALLINT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    label_it TEXT NOT NULL,
    label_en TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0
);

-- RLS
ALTER TABLE public.v2_allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "System allergens are readable by everyone" 
ON public.v2_allergens FOR SELECT 
USING (true);

-- Seed data for 14 EU allergens
INSERT INTO public.v2_allergens (id, code, label_it, label_en, sort_order) VALUES
(1, 'gluten', 'Cereali contenenti glutine', 'Cereals containing gluten', 10),
(2, 'crustaceans', 'Crostacei', 'Crustaceans', 20),
(3, 'eggs', 'Uova', 'Eggs', 30),
(4, 'fish', 'Pesce', 'Fish', 40),
(5, 'peanuts', 'Arachidi', 'Peanuts', 50),
(6, 'soybeans', 'Soia', 'Soybeans', 60),
(7, 'milk', 'Latte', 'Milk', 70),
(8, 'nuts', 'Frutta a guscio', 'Nuts', 80),
(9, 'celery', 'Sedano', 'Celery', 90),
(10, 'mustard', 'Senape', 'Mustard', 100),
(11, 'sesame', 'Sesamo', 'Sesame', 110),
(12, 'sulphites', 'Anidride solforosa e solfiti', 'Sulphur dioxide and sulphites', 120),
(13, 'lupin', 'Lupini', 'Lupin', 130),
(14, 'molluscs', 'Molluschi', 'Molluscs', 140)
ON CONFLICT (id) DO UPDATE SET
    code = EXCLUDED.code,
    label_it = EXCLUDED.label_it,
    label_en = EXCLUDED.label_en,
    sort_order = EXCLUDED.sort_order;


-- 2. PRODUCT ALLERGENS MAPPING
-- Links products/variants to the system allergens
CREATE TABLE IF NOT EXISTS public.v2_product_allergens (
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.v2_products(id) ON DELETE CASCADE,
    allergen_id SMALLINT NOT NULL REFERENCES public.v2_allergens(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    PRIMARY KEY (product_id, allergen_id)
);

-- RLS
ALTER TABLE public.v2_product_allergens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own product allergens" 
ON public.v2_product_allergens
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to product allergens" 
ON public.v2_product_allergens 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_v2_prod_allergens_tenant_product 
ON public.v2_product_allergens(tenant_id, product_id);
