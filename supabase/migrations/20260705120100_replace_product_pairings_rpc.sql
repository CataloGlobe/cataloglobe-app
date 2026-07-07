-- =============================================================================
-- replace_product_pairings — atomic replace RPC for product_pairings
-- =============================================================================
--
-- Allinea la persistenza degli abbinamenti al pattern del dominio
-- (replace_product_allergens / _ingredients / _characteristics in
-- 20260509120000_atomic_product_setters.sql): DELETE + INSERT in una singola
-- transazione PL/pgSQL, con validazione tenant SERVER-SIDE.
--
-- Perché RPC e non upsert client-side:
--   - Sposta la validazione tenant-consistency dei paired_product_id DENTRO il
--     DB (confine reale, non igiene lato browser). Chiude il gap noto della
--     Tranche A: il WITH CHECK RLS garantisce solo `tenant_id` del chiamante,
--     NON l'ownership dei prodotti referenziati.
--   - Atomicità: un save che fallisce rolla back invece di lasciare stato
--     parziale.
--
-- Authorization model (identico agli analoghi):
--   - SECURITY DEFINER + SET search_path = '' (ref tabella sempre qualificate).
--   - Authz manuale: p_tenant_id deve essere fra public.get_my_tenant_ids().
--     ⚠️ auth.uid() è NULL in contesto service_role → la funzione va chiamata
--     dal frontend con user-client (client Supabase normale), non service_role.
--   - Ownership: p_product_id e OGNI paired_product_id devono appartenere a
--     p_tenant_id (fail-closed con eccezione, non silent drop).
--
-- Input p_pairings: jsonb array di { paired_product_id, note, sort_order }.
-- Rispetta UNIQUE(product_id, paired_product_id) [dedupe] e
-- CHECK(product_id <> paired_product_id) [scarto self-pairing] a monte.
--
-- EXECUTE concesso solo a `authenticated`. Revocato da PUBLIC.
--
-- ⚠️ APPLICAZIONE: questo file combina CREATE FUNCTION + REVOKE/GRANT →
-- `supabase db push` fallisce con SQLSTATE 42601 (multiple commands in a
-- prepared statement). Applicare via Studio SQL Editor, poi `migration repair`.
-- =============================================================================

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

REVOKE ALL    ON FUNCTION public.replace_product_pairings(UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.replace_product_pairings(UUID, UUID, JSONB) TO authenticated;
