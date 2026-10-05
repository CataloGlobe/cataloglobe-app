-- revert_manual_translation: un job pending con il testo vecchio viene allineato.
--
-- Caso rimasto dopo 20260624120000 (revert dal source corrente): se per la
-- stessa (entità, campo, lingua) c'è già un job 'pending' accodato prima
-- dell'ultima modifica del testo, il dedup «WHERE NOT EXISTS pending» non
-- accoda niente e il worker traduce lo snapshot vecchio del job. La riga auto
-- nasce con l'hash vecchio, quindi l'elemento resta «da rivedere».
--
-- Fix: prima dell'INSERT, UPDATE del job pending allo snapshot corrente
-- (source_text, source_hash) quando l'hash è diverso. Solo status 'pending':
-- il claim del worker passa il job a 'processing' nella stessa riga, quindi
-- un job già preso non viene cambiato a metà.
--
-- Corpo di partenza: 20260929160000 (con il controllo translations.write).
-- Firma, SECURITY DEFINER, search_path e grant invariati: CREATE OR REPLACE
-- sulla stessa firma conserva i grant, nessun REVOKE/GRANT qui.

CREATE OR REPLACE FUNCTION public.revert_manual_translation(p_tenant_id uuid, p_entity_type text, p_entity_id text, p_field text, p_language_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_source_text   TEXT;
    v_source_hash   TEXT;
    v_deleted_count INTEGER;
BEGIN
    IF p_tenant_id IS NULL OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
    END IF;

    IF NOT public.has_permission_any_activity('translations.write', p_tenant_id) THEN
        RAISE EXCEPTION 'Access denied: translations.write required'
            USING ERRCODE = '42501';
    END IF;

    -- 1. Rimuovi la riga manual/overridden. La riga serve SOLO per esistenza + DELETE
    --    (niente più lettura del source da qui). Se nessuna riga → P0002 (niente da
    --    revertare; corretto su una traduzione puramente 'auto'). Il RAISE rolla back
    --    la DELETE (atomico).
    DELETE FROM public.translations
    WHERE tenant_id     = p_tenant_id
      AND entity_type   = p_entity_type
      AND entity_id     = p_entity_id
      AND field         = p_field
      AND language_code = p_language_code
      AND status        IN ('manual', 'overridden');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    IF v_deleted_count = 0 THEN
        RAISE EXCEPTION 'No manual translation found for this entity/field/language'
            USING ERRCODE = 'P0002';
    END IF;

    -- 2. Lookup del source CORRENTE dall'entità (3 rami reachable). Scoping tenant.
    IF p_entity_type = 'product' AND p_field = 'description' THEN
        SELECT p.description, p.description_hash
        INTO v_source_text, v_source_hash
        FROM public.products p
        WHERE p.id::text = p_entity_id
          AND p.tenant_id = p_tenant_id;

    ELSIF p_entity_type = 'product' AND p_field = 'notes' THEN
        SELECT p.notes::text, p.notes_hash
        INTO v_source_text, v_source_hash
        FROM public.products p
        WHERE p.id::text = p_entity_id
          AND p.tenant_id = p_tenant_id;

    ELSIF p_entity_type = 'category' AND p_field = 'name' THEN
        SELECT c.name, c.name_hash
        INTO v_source_text, v_source_hash
        FROM public.catalog_categories c
        WHERE c.id::text = p_entity_id
          AND c.tenant_id = p_tenant_id;

    ELSE
        -- Irraggiungibile in pratica: i tipi senza editor non hanno righe manual/
        -- overridden, quindi escono al P0002 sopra. Guard difensivo.
        RAISE EXCEPTION 'Unsupported entity_type/field for revert: %/%', p_entity_type, p_field
            USING ERRCODE = 'P0001';
    END IF;

    -- 3. D6 — source corrente NULL/vuoto (es. descrizione svuotata): riga già
    --    cancellata, NESSUN job. L'elemento diventa legittimamente "senza traduzione"
    --    (il join coverage/stale `t.source_hash = <field>_hash` non matcha → missing,
    --    coerente; nessun job orfano creato).
    IF v_source_text IS NULL OR btrim(v_source_text) = '' OR v_source_hash IS NULL THEN
        RETURN;
    END IF;

    -- 4a. Un job 'pending' già in coda per la stessa chiave può portare un testo
    --     vecchio (accodato prima dell'ultima modifica della sorgente). Il dedup
    --     sotto lo terrebbe così e il worker tradurrebbe il testo vecchio: la riga
    --     auto nascerebbe già "da rivedere". Lo si allinea al testo corrente.
    --     Solo 'pending': un job già preso dal worker ('processing') non si tocca.
    UPDATE public.translation_jobs tj
    SET source_text = v_source_text,
        source_hash = v_source_hash
    WHERE tj.tenant_id            = p_tenant_id
      AND tj.entity_type          = p_entity_type
      AND tj.entity_id            = p_entity_id
      AND tj.field                = p_field
      AND tj.target_language_code = p_language_code
      AND tj.status               = 'pending'
      AND tj.source_hash IS DISTINCT FROM v_source_hash;

    -- 4. Accoda job 'pending' con il source CORRENTE, con dedup pending-only (D7).
    INSERT INTO public.translation_jobs (
        tenant_id, entity_type, entity_id, field, target_language_code,
        source_text, source_hash, status
    )
    SELECT
        p_tenant_id, p_entity_type, p_entity_id, p_field, p_language_code,
        v_source_text, v_source_hash, 'pending'
    WHERE NOT EXISTS (
        SELECT 1 FROM public.translation_jobs tj
        WHERE tj.tenant_id            = p_tenant_id
          AND tj.entity_type          = p_entity_type
          AND tj.entity_id            = p_entity_id
          AND tj.field                = p_field
          AND tj.target_language_code = p_language_code
          AND tj.status               = 'pending'
    );
END;
$function$;
