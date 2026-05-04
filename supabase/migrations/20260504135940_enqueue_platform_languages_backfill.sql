-- =============================================================================
-- Prompt 22 — RPC enqueue_platform_languages_backfill
-- =============================================================================
--
-- Scope: backfill platform-level (cross-tenant) translations per tutte le
-- lingue di supported_languages eccetto la lingua base 'it'. Coverage:
--   1. allergens.label
--   2. product_characteristics.label
--
-- Note: product_characteristics.description NON esiste come colonna
-- (verificato pre-flight Prompt 22). Skippata la sezione 3 prevista dal
-- piano originale.
--
-- Idempotenza: skip se job pending/done o translation con stesso source_hash
-- già esistono per (entity, field, lang).
--
-- Cross-tenant: translation_jobs.tenant_id = NULL (system entities).
-- Skip lingua base 'it' (è il source).
--
-- Uso: invocazione manuale UNA volta da SQL Editor admin:
--   SELECT public.enqueue_platform_languages_backfill();
-- Returns: count totale jobs inseriti.
--
-- Stima volume: 32 lingue × (14 allergens + 31 characteristics) = 1440 max.
-- Già esistenti EN translations (skippate): 45.
-- Nuovi jobs attesi: ~1395 (FR/DE/ES + 28 lingue non-curated).
-- DeepL cost: avg 10 chars/label × 1395 ≈ 14k chars (Free plan: 500k/mese).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enqueue_platform_languages_backfill()
    RETURNS INTEGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO ''
AS $$
DECLARE
    v_total_inserted INTEGER := 0;
    v_count INTEGER := 0;
BEGIN
    -- ── 1. allergens.label per tutte le lingue ≠ 'it' ────────────────────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        NULL, 'allergen', a.id::text, 'label', sl.code,
        a.label, a.label_hash, 'pending'
    FROM public.allergens a
    CROSS JOIN public.supported_languages sl
    WHERE sl.code <> 'it'
      AND a.label IS NOT NULL
      AND a.label_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id IS NULL
            AND tj.entity_type = 'allergen'
            AND tj.entity_id = a.id::text
            AND tj.field = 'label'
            AND tj.target_language_code = sl.code
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id IS NULL
            AND t.entity_type = 'allergen'
            AND t.entity_id = a.id::text
            AND t.field = 'label'
            AND t.language_code = sl.code
            AND t.source_hash = a.label_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    -- ── 2. product_characteristics.label per tutte le lingue ≠ 'it' ─────────
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        NULL, 'characteristic', c.id::text, 'label', sl.code,
        c.label, c.label_hash, 'pending'
    FROM public.product_characteristics c
    CROSS JOIN public.supported_languages sl
    WHERE sl.code <> 'it'
      AND c.label IS NOT NULL
      AND c.label_hash IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM public.translation_jobs tj
          WHERE tj.tenant_id IS NULL
            AND tj.entity_type = 'characteristic'
            AND tj.entity_id = c.id::text
            AND tj.field = 'label'
            AND tj.target_language_code = sl.code
            AND tj.status IN ('pending', 'done')
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.translations t
          WHERE t.tenant_id IS NULL
            AND t.entity_type = 'characteristic'
            AND t.entity_id = c.id::text
            AND t.field = 'label'
            AND t.language_code = sl.code
            AND t.source_hash = c.label_hash
      )
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_total_inserted := v_total_inserted + v_count;

    RETURN v_total_inserted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.enqueue_platform_languages_backfill() FROM PUBLIC;
-- NB: niente GRANT a ruoli authenticated/anon. È funzione admin-only,
-- invocata UNA volta da SQL Editor (Dashboard) post-deploy migration.

COMMENT ON FUNCTION public.enqueue_platform_languages_backfill() IS
    'Platform backfill cross-tenant: genera translation_jobs (tenant_id=NULL) per '
    'allergens.label + product_characteristics.label per tutte le lingue di '
    'supported_languages eccetto la base it. Idempotente: skip se job pending/done '
    'o translation con stesso source_hash già esiste. Run-once admin via SQL Editor: '
    'SELECT public.enqueue_platform_languages_backfill(); Returns count totale jobs inseriti.';
