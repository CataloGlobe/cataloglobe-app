-- replace_product_allergens(UUID, UUID, INT[]): chiede products.write (PR di sicurezza 1/5,
-- decisione 4 del censimento RLS).
--
-- La funzione è SECURITY DEFINER e salta la RLS: finora controllava solo
-- p_tenant_id IN get_my_tenant_ids(), quindi ogni membro dell'azienda, viewer
-- di una sede compreso, poteva riscrivere gli allergeni di un prodotto via
-- /rest/v1/rpc. Le policy di 20261002160000 non la chiudono.
--
-- Corpo identico all'ultima definizione del repo (20260509120000_atomic_product_setters.sql),
-- con una sola aggiunta subito dopo il controllo sul tenant:
-- has_permission_any_activity('products.write', p_tenant_id), altrimenti 42501.
-- Firma, SECURITY DEFINER e search_path invariati: CREATE OR REPLACE conserva
-- i grant (EXECUTE solo ad authenticated), quindi niente REVOKE/GRANT.
-- Prima di applicare: confrontare col live (pg_get_functiondef).

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

    IF NOT public.has_permission_any_activity('products.write', p_tenant_id) THEN
        RAISE EXCEPTION 'Forbidden: missing products.write' USING ERRCODE = '42501';
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
