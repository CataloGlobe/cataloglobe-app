-- upsert_manual_translation: serve translations.write, non basta essere membri.
--
-- Come revert_manual_translation (20260929160000): la funzione è SECURITY
-- DEFINER e controllava solo l'appartenenza al tenant, quindi viewer, staff e
-- manager scrivevano traduzioni manuali chiamandola direttamente. Stesso
-- controllo e stesso 42501 delle sorelle: has_permission_any_activity(
-- 'translations.write', p_tenant_id), correlato al tenant passato.
--
-- Corpo di partenza: pg_get_functiondef su staging (2026-09-29). Firma, grant
-- e comportamento per owner/admin invariati. Da solo nel file, senza
-- BEGIN/COMMIT né REVOKE/GRANT (42601 su db push).

CREATE OR REPLACE FUNCTION public.upsert_manual_translation(p_tenant_id uuid, p_entity_type text, p_entity_id text, p_field text, p_language_code text, p_source_text text, p_source_hash text, p_translated_text text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    -- Authz: caller must belong to the tenant. NULL tenant rejected
    -- implicitly (system entities cannot have manual override).
    IF p_tenant_id IS NULL OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any_activity('translations.write', p_tenant_id) THEN
        RAISE EXCEPTION 'Access denied: translations.write required'
            USING ERRCODE = '42501';
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
$function$;
