-- =============================================================================
-- replace_product_ingredients — nuova firma jsonb (ordine esplicito)
--
-- ── PERCHE' jsonb E NON uuid[] ──────────────────────────────────────────────
-- Con `uuid[]` l'ordine si potrebbe derivare dalla posizione nell'array, ma
-- `quantity` e `unit` (colonne dormienti aggiunte da 20260829090000, per il
-- futuro modulo food cost) richiederebbero domani array paralleli o argomenti
-- aggiuntivi — cioe' un secondo cambio di firma, con di nuovo DROP + CREATE +
-- REVOKE/GRANT e un altro allineamento del service.
-- Con un array jsonb di oggetti quei campi diventano chiavi opzionali
-- dell'elemento: si aggiungono senza toccare la firma.
--
-- Payload atteso:
--   [{"ingredient_id": "<uuid>", "sort_order": 0}, ...]
-- `sort_order` e' opzionale: se assente si usa la posizione nell'array
-- (0-based), cosi' un chiamante che manda solo gli id resta valido.
--
-- Guard invariate rispetto alla versione uuid[] (20260509120000): tenant del
-- chiamante, prodotto dentro il tenant, ingredienti tutti dentro il tenant.
-- Aggiunto il rifiuto esplicito dei duplicati, che altrimenti emergerebbero
-- come 23505 opaco sulla PK (product_id, ingredient_id).
--
-- Nota implementativa: niente TEMP TABLE. Con `SET search_path = ''` lo schema
-- `pg_temp` non e' in path e ogni riferimento non qualificato alla temp table
-- fallirebbe; si rilegge il jsonb dove serve (payload di poche decine di
-- elementi, costo irrilevante).
-- =============================================================================

-- La vecchia firma sparisce: nessun chiamante residuo dopo l'allineamento del
-- service (src/services/supabase/ingredients.ts).
DROP FUNCTION IF EXISTS public.replace_product_ingredients(UUID, UUID, UUID[]);

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
