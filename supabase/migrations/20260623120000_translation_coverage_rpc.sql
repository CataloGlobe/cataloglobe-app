-- =============================================================================
-- FASE 2c-1 — get_translation_coverage: copertura traduzioni entity-level, hash-aware
-- =============================================================================
-- Nuova RPC (ADDITIVA: get_translation_progress resta intatta per il polling live
-- leggero). Restituisce, per ogni lingua ATTIVA del tenant, una copertura ONESTA
-- delle traduzioni: classifica ogni unita' traducibile confrontando source_hash col
-- contenuto sorgente attuale, invece di contare job 'done' (come fa
-- get_translation_progress, che e' job-level + cumulativa → dopo il fix 2a conterebbe
-- come "fatte" anche le traduzioni stale).
--
-- Universo (total): identico a cio' che enqueue_tenant_language_backfill accoda
-- (20260610140000) — le 11 categorie di unita' (entity_type, field, <field>_hash,
-- entity_id, filtri <field> IS NOT NULL AND <field>_hash IS NOT NULL). Stesse tuple →
-- total combacia con cio' che viene tradotto.
--
-- Classificazione per unita' (per (unita', lingua attiva)), PRIORITA' esatta:
--   1. pending — translation_jobs con status IN ('pending','processing')
--   2. fresh   — translations con source_hash = <field>_hash (contenuto attuale)
--   3. failed  — translation_jobs con status='failed' (e nessun job in volo, no fresh)
--   4. stale   — translations esiste ma source_hash <> <field>_hash (no in-volo, no failed)
--   5. missing — nessuna delle precedenti
-- Invariante: fresh+stale+pending+failed+missing = total per ogni lingua (CASE
-- esclusivo, esaustivo; UNIQUE (tenant,entity_type,entity_id,field,language_code) su
-- translations → al massimo 1 riga per unita'/lingua).
--
-- last_updated = MAX(translations.updated_at) per quella lingua/tenant, o null.
--
-- Sicurezza: SECURITY DEFINER + SET search_path = '' + qualifiche public.* (pattern
-- get_translation_progress). Caller validato con
-- p_tenant_id IN (SELECT public.get_my_tenant_ids()) — DIVERGENZA INTENZIONALE dal
-- membership-check di get_translation_progress, che escluderebbe l'owner (nessuna riga
-- in tenant_memberships): get_my_tenant_ids() include owner + membri ed e' il gate
-- canonico (stesso usato dal backfill). Sola lettura → nessun has_permission write.
--
-- Nomi chiave: translations usa language_code; translation_jobs usa
-- target_language_code (come nel backfill: Guard B su language_code, Guard A su
-- target_language_code).
--
-- Grant: funzione NUOVA → REVOKE/GRANT avvolti in DO/EXECUTE per evitare SQLSTATE
-- 42601 su supabase db push (regola di progetto per CREATE FUNCTION + GRANT nello
-- stesso file).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_translation_coverage(p_tenant_id uuid)
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

    WITH active_langs AS (
        SELECT tl.language_code
        FROM public.tenant_languages tl
        WHERE tl.tenant_id = p_tenant_id
          AND tl.is_active = true
    ),
    units AS (
        -- 1. product.description
        SELECT 'product'::text AS entity_type, p.id::text AS entity_id,
               'description'::text AS field, p.description_hash AS source_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
        UNION ALL
        -- 2. product.notes
        SELECT 'product', p.id::text, 'notes', p.notes_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.notes IS NOT NULL AND p.notes_hash IS NOT NULL
        UNION ALL
        -- 3. category.name
        SELECT 'category', c.id::text, 'name', c.name_hash
        FROM public.catalog_categories c
        WHERE c.tenant_id = p_tenant_id
          AND c.name IS NOT NULL AND c.name_hash IS NOT NULL
        UNION ALL
        -- 4. ingredient.name
        SELECT 'ingredient', i.id::text, 'name', i.name_hash
        FROM public.ingredients i
        WHERE i.tenant_id = p_tenant_id
          AND i.name IS NOT NULL AND i.name_hash IS NOT NULL
        UNION ALL
        -- 5. option_group.name
        SELECT 'option_group', og.id::text, 'name', og.name_hash
        FROM public.product_option_groups og
        WHERE og.tenant_id = p_tenant_id
          AND og.name IS NOT NULL AND og.name_hash IS NOT NULL
        UNION ALL
        -- 6. option_value.name
        SELECT 'option_value', ov.id::text, 'name', ov.name_hash
        FROM public.product_option_values ov
        WHERE ov.tenant_id = p_tenant_id
          AND ov.name IS NOT NULL AND ov.name_hash IS NOT NULL
        UNION ALL
        -- 7. featured.title
        SELECT 'featured', f.id::text, 'title', f.title_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.title IS NOT NULL AND f.title_hash IS NOT NULL
        UNION ALL
        -- 8. featured.subtitle
        SELECT 'featured', f.id::text, 'subtitle', f.subtitle_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.subtitle IS NOT NULL AND f.subtitle_hash IS NOT NULL
        UNION ALL
        -- 9. featured.description
        SELECT 'featured', f.id::text, 'description', f.description_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.description IS NOT NULL AND f.description_hash IS NOT NULL
        UNION ALL
        -- 10. featured.cta_text
        SELECT 'featured', f.id::text, 'cta_text', f.cta_text_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.cta_text IS NOT NULL AND f.cta_text_hash IS NOT NULL
        UNION ALL
        -- 11. closure.label
        SELECT 'closure', ac.id::text, 'label', ac.label_hash
        FROM public.activity_closures ac
        WHERE ac.tenant_id = p_tenant_id
          AND ac.label IS NOT NULL AND ac.label_hash IS NOT NULL
    ),
    classified AS (
        SELECT
            al.language_code,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = al.language_code
                      AND tj.status IN ('pending', 'processing')
                ) THEN 'pending'
                WHEN EXISTS (
                    SELECT 1 FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.entity_type = u.entity_type
                      AND t.entity_id = u.entity_id
                      AND t.field = u.field
                      AND t.language_code = al.language_code
                      AND t.source_hash = u.source_hash
                ) THEN 'fresh'
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = al.language_code
                      AND tj.status = 'failed'
                ) THEN 'failed'
                WHEN EXISTS (
                    SELECT 1 FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.entity_type = u.entity_type
                      AND t.entity_id = u.entity_id
                      AND t.field = u.field
                      AND t.language_code = al.language_code
                ) THEN 'stale'
                ELSE 'missing'
            END AS klass
        FROM active_langs al
        CROSS JOIN units u
    ),
    agg AS (
        SELECT
            al.language_code,
            COUNT(c.klass)                                  AS total,
            COUNT(*) FILTER (WHERE c.klass = 'fresh')       AS fresh,
            COUNT(*) FILTER (WHERE c.klass = 'stale')       AS stale,
            COUNT(*) FILTER (WHERE c.klass = 'pending')     AS pending,
            COUNT(*) FILTER (WHERE c.klass = 'failed')      AS failed,
            COUNT(*) FILTER (WHERE c.klass = 'missing')     AS missing
        FROM active_langs al
        LEFT JOIN classified c ON c.language_code = al.language_code
        GROUP BY al.language_code
    )
    SELECT COALESCE(
        jsonb_object_agg(
            a.language_code,
            jsonb_build_object(
                'total',        a.total,
                'fresh',        a.fresh,
                'stale',        a.stale,
                'pending',      a.pending,
                'failed',       a.failed,
                'missing',      a.missing,
                'last_updated', (
                    SELECT MAX(t.updated_at)
                    FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.language_code = a.language_code
                )
            )
        ),
        '{}'::jsonb
    )
    INTO v_result
    FROM agg a;

    RETURN v_result;
END;
$$;

DO $$
BEGIN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.get_translation_coverage(uuid) FROM PUBLIC';
    EXECUTE 'GRANT  EXECUTE ON FUNCTION public.get_translation_coverage(uuid) TO authenticated';
END $$;

COMMENT ON FUNCTION public.get_translation_coverage(uuid) IS
'Copertura traduzioni entity-level hash-aware per lingua attiva del tenant. '
'Ritorna JSONB { <language_code>: { total, fresh, stale, pending, failed, missing, '
'last_updated } }. Universo = stesse 11 categorie del backfill '
'(enqueue_tenant_language_backfill). Classificazione per priorita'': '
'pending > fresh > failed > stale > missing. Invariante '
'fresh+stale+pending+failed+missing = total. SECURITY DEFINER + access check via '
'get_my_tenant_ids(). Additiva: get_translation_progress resta per il polling live.';
