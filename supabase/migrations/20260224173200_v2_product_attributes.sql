-- =========================================================================
-- V2 Product Attributes
-- =========================================================================

-- 1. ATTRIBUTE DEFINITIONS
-- Defines what an attribute is (e.g. "Color", "Size", "Spicy Level")
CREATE TABLE IF NOT EXISTS public.v2_product_attribute_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    label TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('text', 'number', 'boolean', 'select', 'multi_select')),
    options JSONB, -- Array of strings/objects for select/multi_select
    is_required BOOLEAN NOT NULL DEFAULT false,
    vertical TEXT, -- e.g. 'restaurant', 'retail'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    UNIQUE (tenant_id, code)
);

-- RLS
ALTER TABLE public.v2_product_attribute_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own attribute definitions" 
ON public.v2_product_attribute_definitions
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to attribute definitions" 
ON public.v2_product_attribute_definitions 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_v2_attr_def_tenant ON public.v2_product_attribute_definitions(tenant_id);

-- 2. ATTRIBUTE VALUES
-- Stores the actual values assigned to products for specific definitions
CREATE TABLE IF NOT EXISTS public.v2_product_attribute_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.v2_tenants(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.v2_products(id) ON DELETE CASCADE,
    attribute_definition_id UUID NOT NULL REFERENCES public.v2_product_attribute_definitions(id) ON DELETE CASCADE,
    
    -- We use separate columns for different types to keep data typed and queryable easily if needed
    value_text TEXT,
    value_number NUMERIC,
    value_boolean BOOLEAN,
    value_json JSONB, -- For multi_select (arrays) or complex objects
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- A product can only have one value per attribute definition
    UNIQUE (product_id, attribute_definition_id)
);

-- RLS
ALTER TABLE public.v2_product_attribute_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can manage their own product attribute values" 
ON public.v2_product_attribute_values
FOR ALL
USING (tenant_id = auth.uid())
WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "Service role has full access to attribute values" 
ON public.v2_product_attribute_values 
FOR ALL 
TO service_role 
USING (true) 
WITH CHECK (true);

-- Indices
CREATE INDEX IF NOT EXISTS idx_v2_attr_val_tenant ON public.v2_product_attribute_values(tenant_id);
CREATE INDEX IF NOT EXISTS idx_v2_attr_val_product ON public.v2_product_attribute_values(product_id);
CREATE INDEX IF NOT EXISTS idx_v2_attr_val_def ON public.v2_product_attribute_values(attribute_definition_id);
