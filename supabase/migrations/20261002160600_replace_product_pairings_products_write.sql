-- replace_product_pairings(UUID, UUID, JSONB): chiede products.write (PR di sicurezza 1/5,
-- decisione 4 del censimento RLS).
--
-- La funzione è SECURITY DEFINER e salta la RLS: finora controllava solo
-- p_tenant_id IN get_my_tenant_ids(), quindi ogni membro dell'azienda, viewer
-- di una sede compreso, poteva riscrivere gli abbinamenti di un prodotto via
-- /rest/v1/rpc. Le policy di 20261002160000 non la chiudono.
--
-- Corpo identico all'ultima definizione del repo (20260705120100_replace_product_pairings_rpc.sql),
-- con una sola aggiunta subito dopo il controllo sul tenant:
-- has_permission_any_activity('products.write', p_tenant_id), altrimenti 42501.
-- Firma, SECURITY DEFINER e search_path invariati: CREATE OR REPLACE conserva
-- i grant (EXECUTE solo ad authenticated), quindi niente REVOKE/GRANT.
-- Prima di applicare: confrontare col live (pg_get_functiondef).

CREATE OR REPLACE FUNCTION public.replace_product_pairings(
    p_tenant_id  UUID,
    p_product_id UUID,
    p_pairings   JSONB
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

    -- Cross-tenant guard: OGNI paired_product_id richiesto (escluso il
    -- self-pairing) deve appartenere al tenant, altrimenti fallisce.
    IF p_pairings IS NOT NULL
       AND jsonb_typeof(p_pairings) = 'array'
       AND jsonb_array_length(p_pairings) > 0
    THEN
        IF EXISTS (
            SELECT 1
            FROM (
                SELECT DISTINCT (elem->>'paired_product_id')::uuid AS pid
                FROM jsonb_array_elements(p_pairings) AS elem
                WHERE (elem->>'paired_product_id')::uuid <> p_product_id
            ) req
            WHERE NOT EXISTS (
                SELECT 1
                FROM public.products p
                WHERE p.id = req.pid AND p.tenant_id = p_tenant_id
            )
        ) THEN
            RAISE EXCEPTION 'One or more paired products do not belong to tenant'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.product_pairings
    WHERE product_id = p_product_id AND tenant_id = p_tenant_id;

    IF p_pairings IS NOT NULL
       AND jsonb_typeof(p_pairings) = 'array'
       AND jsonb_array_length(p_pairings) > 0
    THEN
        -- Dedupe su paired_product_id (mantiene il sort_order minore) e scarta
        -- il self-pairing prima dell'insert. note vuota → NULL.
        INSERT INTO public.product_pairings
            (tenant_id, product_id, paired_product_id, note, sort_order)
        SELECT DISTINCT ON (parsed.paired_product_id)
            p_tenant_id,
            p_product_id,
            parsed.paired_product_id,
            parsed.note,
            parsed.sort_order
        FROM (
            SELECT
                (elem->>'paired_product_id')::uuid       AS paired_product_id,
                NULLIF(elem->>'note', '')                AS note,
                COALESCE((elem->>'sort_order')::int, 0)  AS sort_order
            FROM jsonb_array_elements(p_pairings) AS elem
        ) parsed
        WHERE parsed.paired_product_id <> p_product_id
        ORDER BY parsed.paired_product_id, parsed.sort_order;
    END IF;
END;
$$;
