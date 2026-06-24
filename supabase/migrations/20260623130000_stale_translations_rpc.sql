-- =============================================================================
-- FASE 2c-3a — get_stale_translations: lista elementi "da rivedere" per lingua
-- =============================================================================
-- Nuova RPC (ADDITIVA). Restituisce la LISTA degli elementi rimasti indietro per UNA
-- lingua — lo stesso insieme che get_translation_coverage (20260623120000) classifica
-- come 'stale' o 'missing' nel gap "da rivedere" — ma con i dettagli per elemento
-- (nome visualizzabile, testo IT corrente, status). Alimenta il drawer "Da rivedere".
--
-- Universo + classificazione IDENTICI a get_translation_coverage: stesse 11 categorie,
-- stesse chiavi di join, stessa priorita' pending > fresh > failed > stale > missing.
-- Garanzia: sum(stale + missing) della coverage per la lingua == length() di questo array.
--
-- Output (solo kind IN ('stale','missing'); esclusi fresh/pending/processing/failed):
--   stale   = translations esiste con source_hash <> <field>_hash (status = quello della
--             riga, di solito 'manual'/'overridden').
--   missing = nessuna translations e nessun job → status = null.
--
-- Sicurezza: SECURITY DEFINER + SET search_path = '' + qualifiche public.* (pattern
-- get_translation_coverage). Caller validato con get_my_tenant_ids() (42501 altrimenti).
-- Grant: funzione NUOVA → nasce SENZA il gap anon (REVOKE PUBLIC + REVOKE anon +
-- GRANT authenticated), avvolti in DO/EXECUTE (anti-SQLSTATE 42601 su db push).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_stale_translations(
    p_tenant_id uuid,
    p_language_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- Caller access: owner o membro del tenant. Defense-in-depth (la RPC bypassa RLS).
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id
            USING ERRCODE = '42501';
    END IF;

    WITH units AS (
        -- 1. product.description
        SELECT 'product'::text AS entity_type, p.id::text AS entity_id,
               'description'::text AS field, p.description_hash AS source_hash,
               COALESCE(p.name, '—') AS name, p.description AS source_text
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
        UNION ALL
        -- 2. product.notes
        SELECT 'product', p.id::text, 'notes', p.notes_hash,
               COALESCE(p.name, '—'), p.notes::text
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.notes IS NOT NULL AND p.notes_hash IS NOT NULL
        UNION ALL
        -- 3. category.name
        SELECT 'category', c.id::text, 'name', c.name_hash,
               COALESCE(c.name, '—'), c.name
        FROM public.catalog_categories c
        WHERE c.tenant_id = p_tenant_id
          AND c.name IS NOT NULL AND c.name_hash IS NOT NULL
        UNION ALL
        -- 4. ingredient.name
        SELECT 'ingredient', i.id::text, 'name', i.name_hash,
               COALESCE(i.name, '—'), i.name
        FROM public.ingredients i
        WHERE i.tenant_id = p_tenant_id
          AND i.name IS NOT NULL AND i.name_hash IS NOT NULL
        UNION ALL
        -- 5. option_group.name
        SELECT 'option_group', og.id::text, 'name', og.name_hash,
               COALESCE(og.name, '—'), og.name
        FROM public.product_option_groups og
        WHERE og.tenant_id = p_tenant_id
          AND og.name IS NOT NULL AND og.name_hash IS NOT NULL
        UNION ALL
        -- 6. option_value.name
        SELECT 'option_value', ov.id::text, 'name', ov.name_hash,
               COALESCE(ov.name, '—'), ov.name
        FROM public.product_option_values ov
        WHERE ov.tenant_id = p_tenant_id
          AND ov.name IS NOT NULL AND ov.name_hash IS NOT NULL
        UNION ALL
        -- 7. featured.title
        SELECT 'featured', f.id::text, 'title', f.title_hash,
               COALESCE(f.title, '—'), f.title
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.title IS NOT NULL AND f.title_hash IS NOT NULL
        UNION ALL
        -- 8. featured.subtitle
        SELECT 'featured', f.id::text, 'subtitle', f.subtitle_hash,
               COALESCE(f.title, '—'), f.subtitle
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.subtitle IS NOT NULL AND f.subtitle_hash IS NOT NULL
        UNION ALL
        -- 9. featured.description
        SELECT 'featured', f.id::text, 'description', f.description_hash,
               COALESCE(f.title, '—'), f.description
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.description IS NOT NULL AND f.description_hash IS NOT NULL
        UNION ALL
        -- 10. featured.cta_text
        SELECT 'featured', f.id::text, 'cta_text', f.cta_text_hash,
               COALESCE(f.title, '—'), f.cta_text
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.cta_text IS NOT NULL AND f.cta_text_hash IS NOT NULL
        UNION ALL
        -- 11. closure.label
        SELECT 'closure', ac.id::text, 'label', ac.label_hash,
               COALESCE(ac.label, '—'), ac.label
        FROM public.activity_closures ac
        WHERE ac.tenant_id = p_tenant_id
          AND ac.label IS NOT NULL AND ac.label_hash IS NOT NULL
    ),
    classified AS (
        SELECT
            u.entity_type,
            u.entity_id,
            u.field,
            u.name,
            u.source_text,
            t.status AS t_status,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = p_language_code
                      AND tj.status IN ('pending', 'processing')
                ) THEN 'pending'
                WHEN t.source_hash IS NOT NULL AND t.source_hash = u.source_hash
                    THEN 'fresh'
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = p_language_code
                      AND tj.status = 'failed'
                ) THEN 'failed'
                WHEN t.source_hash IS NOT NULL THEN 'stale'
                ELSE 'missing'
            END AS kind
        FROM units u
        LEFT JOIN public.translations t
            ON t.tenant_id = p_tenant_id
           AND t.entity_type = u.entity_type
           AND t.entity_id = u.entity_id
           AND t.field = u.field
           AND t.language_code = p_language_code
    )
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'entity_type', c.entity_type,
                'entity_id',   c.entity_id,
                'field',       c.field,
                'name',        c.name,
                'source_text', c.source_text,
                'status',      CASE WHEN c.kind = 'stale' THEN c.t_status ELSE NULL END,
                'kind',        c.kind
            )
            ORDER BY c.entity_type, c.name, c.field
        ),
        '[]'::jsonb
    )
    INTO v_result
    FROM classified c
    WHERE c.kind IN ('stale', 'missing');

    RETURN v_result;
END;
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_stale_translations(uuid, text) FROM PUBLIC';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_stale_translations(uuid, text) FROM anon';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.get_stale_translations(uuid, text) TO authenticated';
END $$;

COMMENT ON FUNCTION public.get_stale_translations(uuid, text) IS
'Lista elementi "da rivedere" (kind stale|missing) per lingua. Stesso universo/'
'classificazione di get_translation_coverage: sum(stale+missing) coverage == length() '
'di questo array. Ogni elemento: entity_type, entity_id, field, name, source_text, '
'status (riga stale, null se missing), kind. SECURITY DEFINER + get_my_tenant_ids().';
