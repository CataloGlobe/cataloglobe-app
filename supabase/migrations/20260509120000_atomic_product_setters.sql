-- =============================================================================
-- Atomic replace RPCs for product join tables
-- =============================================================================
--
-- Replaces the non-atomic delete-then-insert pattern in:
--   - allergens.ts            → setProductAllergens
--   - ingredients.ts          → setProductIngredients
--   - productCharacteristics.ts → setProductCharacteristics
--
-- Each RPC runs the DELETE + INSERT inside a single PL/pgSQL transaction,
-- so a partial failure rolls back instead of leaving the product with no
-- assignments.
--
-- Authorization model:
--   - SECURITY DEFINER + SET search_path = '' (qualified table refs only).
--   - Manual authz: caller must have access to the tenant via
--     public.get_my_tenant_ids().
--   - Product ownership check: the product must belong to the same tenant.
--   - For ingredients (tenant-scoped lookup) the array is also validated
--     to belong to the tenant; allergens / characteristics are system
--     lookups (cross-tenant), so no per-id ownership check.
--
-- EXECUTE granted only to `authenticated`. Revoked from PUBLIC.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- replace_product_allergens
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_product_allergens(
    p_tenant_id    UUID,
    p_product_id   UUID,
    p_allergen_ids INT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.products
        WHERE id = p_product_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Product not found in tenant' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.product_allergens
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id;

    IF p_allergen_ids IS NOT NULL AND array_length(p_allergen_ids, 1) > 0 THEN
        INSERT INTO public.product_allergens (tenant_id, product_id, allergen_id)
        SELECT p_tenant_id, p_product_id, unnest(p_allergen_ids)::SMALLINT;
    END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.replace_product_allergens(UUID, UUID, INT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_allergens(UUID, UUID, INT[]) TO authenticated;


-- -----------------------------------------------------------------------------
-- replace_product_ingredients
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_product_ingredients(
    p_tenant_id      UUID,
    p_product_id     UUID,
    p_ingredient_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.products
        WHERE id = p_product_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Product not found in tenant' USING ERRCODE = 'P0002';
    END IF;

    -- Cross-tenant guard: every ingredient_id must belong to the same tenant.
    IF p_ingredient_ids IS NOT NULL AND array_length(p_ingredient_ids, 1) > 0 THEN
        IF (
            SELECT COUNT(*)
            FROM public.ingredients
            WHERE id = ANY(p_ingredient_ids) AND tenant_id = p_tenant_id
        ) <> array_length(p_ingredient_ids, 1) THEN
            RAISE EXCEPTION 'One or more ingredients do not belong to tenant'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.product_ingredients
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id;

    IF p_ingredient_ids IS NOT NULL AND array_length(p_ingredient_ids, 1) > 0 THEN
        INSERT INTO public.product_ingredients (tenant_id, product_id, ingredient_id)
        SELECT p_tenant_id, p_product_id, unnest(p_ingredient_ids);
    END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.replace_product_ingredients(UUID, UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_ingredients(UUID, UUID, UUID[]) TO authenticated;


-- -----------------------------------------------------------------------------
-- replace_product_characteristics
-- -----------------------------------------------------------------------------
-- Lookup table `product_characteristics` is system-level (no tenant_id),
-- so no cross-tenant guard on the ids array — mirrors allergens.
-- Join table is `product_characteristic_assignments`.
CREATE OR REPLACE FUNCTION public.replace_product_characteristics(
    p_tenant_id          UUID,
    p_product_id         UUID,
    p_characteristic_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.products
        WHERE id = p_product_id AND tenant_id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Product not found in tenant' USING ERRCODE = 'P0002';
    END IF;

    DELETE FROM public.product_characteristic_assignments
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id;

    IF p_characteristic_ids IS NOT NULL AND array_length(p_characteristic_ids, 1) > 0 THEN
        INSERT INTO public.product_characteristic_assignments
            (tenant_id, product_id, characteristic_id)
        SELECT p_tenant_id, p_product_id, unnest(p_characteristic_ids);
    END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.replace_product_characteristics(UUID, UUID, UUID[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_characteristics(UUID, UUID, UUID[]) TO authenticated;
