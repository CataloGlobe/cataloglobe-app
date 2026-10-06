-- replace_product_ingredients(UUID, UUID, JSONB): chiede products.write (PR di sicurezza 1/5,
-- decisione 4 del censimento RLS).
--
-- La funzione è SECURITY DEFINER e salta la RLS: finora controllava solo
-- p_tenant_id IN get_my_tenant_ids(), quindi ogni membro dell'azienda, viewer
-- di una sede compreso, poteva riscrivere gli ingredienti di un prodotto via
-- /rest/v1/rpc. Le policy di 20261002160000 non la chiudono.
--
-- Corpo identico all'ultima definizione del repo (20260829090001_replace_product_ingredients_jsonb.sql),
-- con una sola aggiunta subito dopo il controllo sul tenant:
-- has_permission_any_activity('products.write', p_tenant_id), altrimenti 42501.
-- Firma, SECURITY DEFINER e search_path invariati: CREATE OR REPLACE conserva
-- i grant (EXECUTE solo ad authenticated), quindi niente REVOKE/GRANT.
-- Prima di applicare: confrontare col live (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.replace_product_ingredients(
    p_tenant_id   UUID,
    p_product_id  UUID,
    p_ingredients JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_payload  JSONB := COALESCE(p_ingredients, '[]'::jsonb);
    v_count    INT;
    v_distinct INT;
    v_owned    INT;
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

    IF jsonb_typeof(v_payload) <> 'array' THEN
        RAISE EXCEPTION '`p_ingredients` must be a JSON array' USING ERRCODE = '22023';
    END IF;

    SELECT count(*), count(DISTINCT (elem->>'ingredient_id')::uuid)
    INTO v_count, v_distinct
    FROM jsonb_array_elements(v_payload) AS t(elem)
    WHERE elem->>'ingredient_id' IS NOT NULL;

    IF v_count <> v_distinct THEN
        RAISE EXCEPTION 'Duplicate ingredient_id in payload' USING ERRCODE = '22023';
    END IF;

    -- Cross-tenant guard: ogni ingredient_id deve appartenere allo stesso tenant.
    IF v_count > 0 THEN
        SELECT count(*)
        INTO v_owned
        FROM public.ingredients i
        WHERE i.tenant_id = p_tenant_id
          AND i.id IN (
              SELECT (elem->>'ingredient_id')::uuid
              FROM jsonb_array_elements(v_payload) AS t(elem)
              WHERE elem->>'ingredient_id' IS NOT NULL
          );

        IF v_owned <> v_distinct THEN
            RAISE EXCEPTION 'One or more ingredients do not belong to tenant'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.product_ingredients
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id;

    IF v_count > 0 THEN
        INSERT INTO public.product_ingredients (tenant_id, product_id, ingredient_id, sort_order)
        SELECT
            p_tenant_id,
            p_product_id,
            (t.elem->>'ingredient_id')::uuid,
            COALESCE((t.elem->>'sort_order')::int, (t.ord - 1)::int)
        FROM jsonb_array_elements(v_payload) WITH ORDINALITY AS t(elem, ord)
        WHERE t.elem->>'ingredient_id' IS NOT NULL;
    END IF;
END;
$$;
