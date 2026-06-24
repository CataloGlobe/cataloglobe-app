-- =============================================================================
-- FASE 2a-bis — revert_manual_translation: supportare anche status 'overridden'
-- =============================================================================
-- "Torna a traduzione automatica" deve funzionare anche sugli override manuali di una
-- traduzione automatica (status='overridden'), non solo sulle manuali pure ('manual').
-- Prima: i filtri di stato erano `status = 'manual'` (lookup + DELETE) → su un
-- 'overridden' nessuna riga trovata → P0002 → azione fallita dal drawer "Da rivedere".
--
-- Fix chirurgico: allargare ENTRAMBI i filtri a `status IN ('manual','overridden')`.
-- Nient'altro cambia: tenant-guard, lettura source_text/source_hash, INSERT del job
-- 'pending' (ri-traduzione automatica), RAISE P0002 (ancora corretto su una traduzione
-- puramente 'auto', dove non c'è override da rimuovere), firma, SECURITY DEFINER,
-- search_path. CREATE OR REPLACE preserva i grant → nessuna istruzione di grant qui.
--
-- NON modifica la migration esistente 20260509130000.
-- =============================================================================

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

    -- Lookup the manual/overridden row to preserve its source for re-translation.
    SELECT source_text, source_hash
    INTO v_source_text, v_source_hash
    FROM public.translations
    WHERE tenant_id     = p_tenant_id
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code
      AND status        IN ('manual', 'overridden');

    IF v_source_text IS NULL THEN
        RAISE EXCEPTION 'No manual translation found for this entity/field/language'
            USING ERRCODE = 'P0002';
    END IF;

    -- Delete the manual/overridden row.
    DELETE FROM public.translations
    WHERE tenant_id     = p_tenant_id
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code
      AND status        IN ('manual', 'overridden');

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
