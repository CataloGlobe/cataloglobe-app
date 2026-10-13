-- =============================================================================
-- Conferma all'accensione di una lingua: quanti testi si tradurranno
-- =============================================================================
-- Prima di accendere una lingua la pagina Lingue chiede conferma con il numero
-- di testi che il recupero (enqueue_tenant_language_backfill) accoderà.
-- get_translation_coverage conta solo le lingue già attive: questa RPC conta
-- per una lingua qualsiasi del catalogo, attiva o no.
--
-- Unità: le stesse di get_translation_coverage (⚠️ SYNC: se si aggiunge un
-- tipo di testo traducibile, va aggiunto anche qui). «Da tradurre» = nessuna
-- traduzione con l'hash corrente per quella lingua (mancante o rimasta
-- indietro), come il filtro del recupero.
--
-- Sola lettura. SECURITY DEFINER come get_translation_coverage (legge tabelle
-- di più entità); autorizzazione come il recupero: membro dell'azienda con
-- translations.write (chi può accendere una lingua).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.count_tenant_language_backfill(
    p_tenant_id uuid,
    p_target_lang text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    IF NOT (
        p_tenant_id IN (SELECT public.get_my_tenant_ids())
        AND public.has_permission_any_activity('translations.write', p_tenant_id)
    ) THEN
        RAISE EXCEPTION 'Access denied: translations.write required'
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.supported_languages
        WHERE code = p_target_lang AND is_available = true
    ) THEN
        RAISE EXCEPTION 'Language not available: %', p_target_lang
            USING ERRCODE = '22023';
    END IF;

    WITH
    units AS (
        SELECT 'product'::text AS entity_type, p.id::text AS entity_id,
               'description'::text AS field, p.description_hash AS source_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
        UNION ALL
        SELECT 'product', p.id::text, 'notes', p.notes_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.notes IS NOT NULL AND p.notes_hash IS NOT NULL
        UNION ALL
        SELECT 'category', c.id::text, 'name', c.name_hash
        FROM public.catalog_categories c
        WHERE c.tenant_id = p_tenant_id
          AND c.name IS NOT NULL AND c.name_hash IS NOT NULL
        UNION ALL
        SELECT 'ingredient', i.id::text, 'name', i.name_hash
        FROM public.ingredients i
        WHERE i.tenant_id = p_tenant_id
          AND i.name IS NOT NULL AND i.name_hash IS NOT NULL
        UNION ALL
        SELECT 'option_group', og.id::text, 'name', og.name_hash
        FROM public.product_option_groups og
        WHERE og.tenant_id = p_tenant_id
          AND og.name IS NOT NULL AND og.name_hash IS NOT NULL
        UNION ALL
        SELECT 'option_value', ov.id::text, 'name', ov.name_hash
        FROM public.product_option_values ov
        WHERE ov.tenant_id = p_tenant_id
          AND ov.name IS NOT NULL AND ov.name_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'title', f.title_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.title IS NOT NULL AND f.title_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'subtitle', f.subtitle_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.subtitle IS NOT NULL AND f.subtitle_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'description', f.description_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.description IS NOT NULL AND f.description_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'cta_text', f.cta_text_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.cta_text IS NOT NULL AND f.cta_text_hash IS NOT NULL
        UNION ALL
        SELECT 'closure', ac.id::text, 'label', ac.label_hash
        FROM public.activity_closures ac
        WHERE ac.tenant_id = p_tenant_id
          AND ac.label IS NOT NULL AND ac.label_hash IS NOT NULL
    )
    SELECT COUNT(*)::integer
    INTO v_count
    FROM units u
    WHERE NOT EXISTS (
        SELECT 1 FROM public.translations t
        WHERE t.tenant_id = p_tenant_id
          AND t.entity_type = u.entity_type
          AND t.entity_id = u.entity_id
          AND t.field = u.field
          AND t.language_code = p_target_lang
          AND t.source_hash = u.source_hash
    );

    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.count_tenant_language_backfill(uuid, text) IS
    'Quanti testi dell''azienda non hanno una traduzione aggiornata in '
    'p_target_lang (attiva o no): il numero della conferma all''accensione di '
    'una lingua. Unità ⚠️ SYNC con get_translation_coverage. Sola lettura, '
    'membro con translations.write.';

REVOKE EXECUTE ON FUNCTION public.count_tenant_language_backfill(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_tenant_language_backfill(uuid, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.count_tenant_language_backfill(uuid, text) TO authenticated;
