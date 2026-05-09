-- =============================================================================
-- Manual override support for translations (variant C2 backend)
-- =============================================================================
--
-- Adds 3 RPCs to enable safe manual translation overrides:
--
--   1. upsert_auto_translation       — replaces direct UPSERT in
--      process-translation-jobs edge function. Skips rows with
--      status='manual' (server-side guard). Granted to service_role.
--
--   2. upsert_manual_translation     — frontend-callable. Writes
--      status='manual' + provider='manual'. Tenant-scoped via
--      get_my_tenant_ids(). Overwrites existing rows unconditionally
--      (manual replaces auto OR previous manual).
--
--   3. revert_manual_translation     — deletes the manual row and
--      enqueues a fresh translation_job for auto re-translation.
--
-- Authorization model:
--   - All 3 RPCs are SECURITY DEFINER + SET search_path = ''.
--   - upsert_auto_translation: only service_role (edge function).
--   - upsert_manual_translation / revert_manual_translation: only
--     authenticated, with manual tenant guard.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. upsert_auto_translation
-- -----------------------------------------------------------------------------
-- Returns BOOLEAN: TRUE = wrote/updated, FALSE = preserved manual.
CREATE OR REPLACE FUNCTION public.upsert_auto_translation(
    p_tenant_id       UUID,
    p_entity_type     TEXT,
    p_entity_id       TEXT,
    p_field           TEXT,
    p_language_code   TEXT,
    p_source_text     TEXT,
    p_source_hash     TEXT,
    p_translated_text TEXT,
    p_provider        TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_status TEXT;
BEGIN
    -- Provider whitelist: only auto-issued providers may use this RPC.
    IF p_provider NOT IN ('deepl', 'google', 'system', 'mock') THEN
        RAISE EXCEPTION 'Invalid provider for auto translation: %', p_provider
            USING ERRCODE = '22023';
    END IF;

    -- Lookup current status, if any.
    SELECT status
    INTO v_existing_status
    FROM public.translations
    WHERE (tenant_id IS NOT DISTINCT FROM p_tenant_id)
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code;

    -- Guard 1: explicit short-circuit when row is manual.
    IF v_existing_status = 'manual' THEN
        RETURN FALSE;
    END IF;

    -- INSERT new row OR UPDATE existing auto row.
    -- Guard 2 (defense-in-depth): WHERE status = 'auto' on the UPDATE branch
    -- protects against a race between SELECT above and INSERT ... ON CONFLICT.
    INSERT INTO public.translations (
        tenant_id, entity_type, entity_id, field, language_code,
        source_text, source_hash, translated_text, provider, status
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_field, p_language_code,
        p_source_text, p_source_hash, p_translated_text, p_provider, 'auto'
    )
    ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
    DO UPDATE SET
        source_text     = EXCLUDED.source_text,
        source_hash     = EXCLUDED.source_hash,
        translated_text = EXCLUDED.translated_text,
        provider        = EXCLUDED.provider,
        status          = 'auto',
        updated_at      = now()
    WHERE public.translations.status = 'auto';

    RETURN TRUE;
END;
$$;

REVOKE ALL    ON FUNCTION public.upsert_auto_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_auto_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- -----------------------------------------------------------------------------
-- 2. upsert_manual_translation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_manual_translation(
    p_tenant_id       UUID,
    p_entity_type     TEXT,
    p_entity_id       TEXT,
    p_field           TEXT,
    p_language_code   TEXT,
    p_source_text     TEXT,
    p_source_hash     TEXT,
    p_translated_text TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Authz: caller must belong to the tenant. NULL tenant rejected
    -- implicitly (system entities cannot have manual override).
    IF p_tenant_id IS NULL OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    -- Validation: source must not be empty.
    IF p_source_text IS NULL OR length(trim(p_source_text)) = 0 THEN
        RAISE EXCEPTION 'Cannot create manual translation for empty source'
            USING ERRCODE = '22023';
    END IF;

    -- Validation: translated text must not be empty.
    IF p_translated_text IS NULL OR length(trim(p_translated_text)) = 0 THEN
        RAISE EXCEPTION 'Translated text cannot be empty'
            USING ERRCODE = '22023';
    END IF;

    -- Validation: language code is a known platform language.
    IF NOT EXISTS (
        SELECT 1 FROM public.supported_languages WHERE code = p_language_code
    ) THEN
        RAISE EXCEPTION 'Unsupported language code: %', p_language_code
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.translations (
        tenant_id, entity_type, entity_id, field, language_code,
        source_text, source_hash, translated_text, provider, status
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_field, p_language_code,
        p_source_text, p_source_hash, p_translated_text, 'manual', 'manual'
    )
    ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
    DO UPDATE SET
        source_text     = EXCLUDED.source_text,
        source_hash     = EXCLUDED.source_hash,
        translated_text = EXCLUDED.translated_text,
        provider        = 'manual',
        status          = 'manual',
        updated_at      = now();
END;
$$;

REVOKE ALL    ON FUNCTION public.upsert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;


-- -----------------------------------------------------------------------------
-- 3. revert_manual_translation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_manual_translation(
    p_tenant_id     UUID,
    p_entity_type   TEXT,
    p_entity_id     TEXT,
    p_field         TEXT,
    p_language_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_source_text TEXT;
    v_source_hash TEXT;
BEGIN
    IF p_tenant_id IS NULL OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    -- Lookup the manual row to preserve its source for re-translation.
    SELECT source_text, source_hash
    INTO v_source_text, v_source_hash
    FROM public.translations
    WHERE tenant_id     = p_tenant_id
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code
      AND status        = 'manual';

    IF v_source_text IS NULL THEN
        RAISE EXCEPTION 'No manual translation found for this entity/field/language'
            USING ERRCODE = 'P0002';
    END IF;

    -- Delete the manual row.
    DELETE FROM public.translations
    WHERE tenant_id     = p_tenant_id
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code
      AND status        = 'manual';

    -- Enqueue a fresh translation job for auto re-translation.
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    ) VALUES (
        p_tenant_id, p_entity_type, p_entity_id, p_field, p_language_code,
        v_source_text, v_source_hash, 'pending'
    );
END;
$$;

REVOKE ALL    ON FUNCTION public.revert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
