-- =============================================================================
-- Prompt 20 — RPC enqueue_tenant_language_backfill
-- =============================================================================
--
-- Scope: al toggle ON di una lingua nella pagina Settings → Lingue,
-- genera in bulk translation_jobs (status=pending) per tutte le entity
-- del tenant con source non-null che NON hanno ancora una translation
-- valida (stesso source_hash) per la lingua target, e che NON hanno
-- già un job pending/done in coda.
--
-- Coverage entity (8 campi):
--   1. products.description          → field='description'
--   2. products.notes (jsonb)        → field='notes'  (source_text=hash, vedi note)
--   3. catalog_categories.name       → field='name'
--   4. ingredients.name              → field='name'
--   5. product_option_groups.name    → field='name'
--   6. product_option_values.name    → field='name'
--   7. featured_contents.{title,subtitle,description,cta_text} → 4 fields
--   8. activity_closures.label       → field='label'
--
-- Skip (intenzionali):
--   - featured_content_products.note  → fcp.id non ancora esposto in payload (Prompt 13c TODO)
--   - product_attribute_*             → vertical-aware skip per F&B (write-side)
--   - product_variant_*               → Prompt 10c TODO (refactor stable-id)
--   - allergens / product_characteristics → system tables, cross-tenant
--     (backfill via tenant_id IS NULL handled in Prompt 3+3b)
--
-- Idempotenza:
--   Per ciascun campo, INSERT solo se NON esiste già un job (pending/done)
--   né una translation con stesso source_hash. ON CONFLICT DO NOTHING per
--   protezione concorrente.
--
-- Defense-in-depth security:
--   Verifica esplicita che (p_tenant_id, p_target_lang) sia attiva in
--   tenant_languages. Senza questo check, un caller malicioso potrebbe
--   pre-creare jobs per lingue non attivate.
--
-- Note: products.notes è JSONB. Per coerenza con il pattern del Prompt 7
-- (translation jobs per notes), usiamo notes::text come source_text e
-- notes_hash come source_hash. La pipeline traduzioni (DeepL) gestisce il
-- contenuto serializzato.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_tenant_language_backfill(
    p_tenant_id UUID,
    p_target_lang TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_total_inserted INTEGER := 0;
    v_count INTEGER := 0;
BEGIN
    -- Validation 1: tenant esiste
    IF NOT EXISTS (
        SELECT 1 FROM public.tenants WHERE id = p_tenant_id
    ) THEN
        RAISE EXCEPTION 'Tenant not found: %', p_tenant_id;
    END IF;

    -- Validation 2: lingua è curated (is_available=true)
    IF NOT EXISTS (
        SELECT 1 FROM public.supported_languages
        WHERE code = p_target_lang AND is_available = true
    ) THEN
        RAISE EXCEPTION 'Language not available: %', p_target_lang;
    END IF;

    -- Validation 3 (defense-in-depth): tenant deve avere la lingua attiva
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_languages
        WHERE tenant_id = p_tenant_id
          AND language_code = p_target_lang
          AND is_active = true
    ) THEN
        RAISE EXCEPTION 'Language not active for tenant: %', p_target_lang;
    END IF;

    -- ── 1. products.description ──────────────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'product', p.id::text, 'description', p_target_lang,
        p.description, p.description_hash, 'pending'
    FROM public.products p
    WHERE p.tenant_id = p_tenant_id
      AND p.description IS NOT NULL
      AND p.description_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'product'
            AND tj.entity_id = p.id::text
            AND tj.field = 'description'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'product'
            AND t.entity_id = p.id::text
            AND t.field = 'description'
            AND t.language_code = p_target_lang
            AND t.source_hash = p.description_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 2. products.notes (JSONB serialized via notes_hash) ──────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'product', p.id::text, 'notes', p_target_lang,
        p.notes::text, p.notes_hash, 'pending'
    FROM public.products p
    WHERE p.tenant_id = p_tenant_id
      AND p.notes IS NOT NULL
      AND p.notes_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'product'
            AND tj.entity_id = p.id::text
            AND tj.field = 'notes'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'product'
            AND t.entity_id = p.id::text
            AND t.field = 'notes'
            AND t.language_code = p_target_lang
            AND t.source_hash = p.notes_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 3. catalog_categories.name ──────────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'category', c.id::text, 'name', p_target_lang,
        c.name, c.name_hash, 'pending'
    FROM public.catalog_categories c
    WHERE c.tenant_id = p_tenant_id
      AND c.name IS NOT NULL
      AND c.name_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'category'
            AND tj.entity_id = c.id::text
            AND tj.field = 'name'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'category'
            AND t.entity_id = c.id::text
            AND t.field = 'name'
            AND t.language_code = p_target_lang
            AND t.source_hash = c.name_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 4. ingredients.name ─────────────────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'ingredient', i.id::text, 'name', p_target_lang,
        i.name, i.name_hash, 'pending'
    FROM public.ingredients i
    WHERE i.tenant_id = p_tenant_id
      AND i.name IS NOT NULL
      AND i.name_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'ingredient'
            AND tj.entity_id = i.id::text
            AND tj.field = 'name'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'ingredient'
            AND t.entity_id = i.id::text
            AND t.field = 'name'
            AND t.language_code = p_target_lang
            AND t.source_hash = i.name_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 5. product_option_groups.name ───────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'option_group', og.id::text, 'name', p_target_lang,
        og.name, og.name_hash, 'pending'
    FROM public.product_option_groups og
    WHERE og.tenant_id = p_tenant_id
      AND og.name IS NOT NULL
      AND og.name_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'option_group'
            AND tj.entity_id = og.id::text
            AND tj.field = 'name'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'option_group'
            AND t.entity_id = og.id::text
            AND t.field = 'name'
            AND t.language_code = p_target_lang
            AND t.source_hash = og.name_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 6. product_option_values.name ───────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'option_value', ov.id::text, 'name', p_target_lang,
        ov.name, ov.name_hash, 'pending'
    FROM public.product_option_values ov
    WHERE ov.tenant_id = p_tenant_id
      AND ov.name IS NOT NULL
      AND ov.name_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'option_value'
            AND tj.entity_id = ov.id::text
            AND tj.field = 'name'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'option_value'
            AND t.entity_id = ov.id::text
            AND t.field = 'name'
            AND t.language_code = p_target_lang
            AND t.source_hash = ov.name_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 7. featured_contents (4 fields) ─────────────────────────────────────
    -- 7a. title
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'featured', f.id::text, 'title', p_target_lang,
        f.title, f.title_hash, 'pending'
    FROM public.featured_contents f
    WHERE f.tenant_id = p_tenant_id
      AND f.title IS NOT NULL
      AND f.title_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'featured'
            AND tj.entity_id = f.id::text
            AND tj.field = 'title'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'featured'
            AND t.entity_id = f.id::text
            AND t.field = 'title'
            AND t.language_code = p_target_lang
            AND t.source_hash = f.title_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- 7b. subtitle
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'featured', f.id::text, 'subtitle', p_target_lang,
        f.subtitle, f.subtitle_hash, 'pending'
    FROM public.featured_contents f
    WHERE f.tenant_id = p_tenant_id
      AND f.subtitle IS NOT NULL
      AND f.subtitle_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'featured'
            AND tj.entity_id = f.id::text
            AND tj.field = 'subtitle'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'featured'
            AND t.entity_id = f.id::text
            AND t.field = 'subtitle'
            AND t.language_code = p_target_lang
            AND t.source_hash = f.subtitle_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- 7c. description
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'featured', f.id::text, 'description', p_target_lang,
        f.description, f.description_hash, 'pending'
    FROM public.featured_contents f
    WHERE f.tenant_id = p_tenant_id
      AND f.description IS NOT NULL
      AND f.description_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'featured'
            AND tj.entity_id = f.id::text
            AND tj.field = 'description'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'featured'
            AND t.entity_id = f.id::text
            AND t.field = 'description'
            AND t.language_code = p_target_lang
            AND t.source_hash = f.description_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- 7d. cta_text
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'featured', f.id::text, 'cta_text', p_target_lang,
        f.cta_text, f.cta_text_hash, 'pending'
    FROM public.featured_contents f
    WHERE f.tenant_id = p_tenant_id
      AND f.cta_text IS NOT NULL
      AND f.cta_text_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'featured'
            AND tj.entity_id = f.id::text
            AND tj.field = 'cta_text'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'featured'
            AND t.entity_id = f.id::text
            AND t.field = 'cta_text'
            AND t.language_code = p_target_lang
            AND t.source_hash = f.cta_text_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 8. activity_closures.label ──────────────────────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, 'closure', ac.id::text, 'label', p_target_lang,
        ac.label, ac.label_hash, 'pending'
    FROM public.activity_closures ac
    WHERE ac.tenant_id = p_tenant_id
      AND ac.label IS NOT NULL
      AND ac.label_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id = p_tenant_id
            AND tj.entity_type = 'closure'
            AND tj.entity_id = ac.id::text
            AND tj.field = 'label'
            AND tj.target_language_code = p_target_lang
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id = p_tenant_id
            AND t.entity_type = 'closure'
            AND t.entity_id = ac.id::text
            AND t.field = 'label'
            AND t.language_code = p_target_lang
            AND t.source_hash = ac.label_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    RETURN v_total_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_tenant_language_backfill(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_tenant_language_backfill(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.enqueue_tenant_language_backfill(UUID, TEXT) IS
    'Lazy backfill: genera translation_jobs (status=pending) per tutte le entity '
    'del tenant con source non-null e source_hash valorizzato, per la lingua target. '
    'Idempotente: skip se job pending/done o translation con stesso source_hash già esiste. '
    'Defense-in-depth: richiede tenant_languages riga (p_tenant_id, p_target_lang, is_active=true) '
    'PRIMA della chiamata. Service activateTenantLanguage upserta tenant_languages PRIMA di invocare. '
    'Returns: count totale di jobs inseriti.';
