-- =============================================================================
-- FASE 2 — revert_manual_translation: accodare il source IT CORRENTE dell'entità
-- =============================================================================
-- Bug: la revert leggeva source_text/source_hash DALLA riga manual/overridden che
-- cancella. Nel caso "Da rivedere" quella riga è stale per definizione (il suo
-- source_hash ≠ <field>_hash corrente dell'entità). Il worker — esecutore fedele
-- dello snapshot del job — ritraduceva il testo VECCHIO e scriveva una riga auto con
-- hash vecchio → l'elemento restava stale, ora senza più il tasto revert.
--
-- Fix (all'enqueue, dentro la revert): leggere il source CORRENTE dall'ENTITÀ
-- (products.description/_hash, products.notes::text/notes_hash, catalog_categories.
-- name/_hash) via lookup inline. Gli <field>_hash sono la STESSA colonna che
-- coverage/stale confrontano → la nuova riga auto nasce `fresh` e l'elemento esce da
-- "da rivedere". Il worker NON va toccato (usa source_text/source_hash del job as-is).
--
-- Questa è la versione CANONICA della revert: include il widening
-- status IN ('manual','overridden') già introdotto in 20260623160000, che sostituisce
-- logicamente (entrambe CREATE OR REPLACE → vince l'ultima applicata).
--
-- Differenze vs 20260623160000:
--   1. La riga translations serve SOLO per esistenza + DELETE (P0002 via ROW_COUNT=0),
--      non più come fonte del source.
--   2. Source letto via CASE sull'entità (3 rami reachable).
--   3. D6: se il source corrente è NULL/vuoto → riga cancellata, NESSUN job
--      (l'elemento diventa legittimamente "senza traduzione").
--   4. D7: INSERT con dedup `WHERE NOT EXISTS (pending)` — predicato pending-only,
--      allineato al dedup index parziale `translation_jobs_dedup_idx` (WHERE status=
--      'pending'). NB: NON si include 'done' come fa enqueue_tenant_language_backfill:
--      un vecchio job 'done' (dalla traduzione auto originale) esiste quasi sempre, e
--      includerlo sopprimerebbe ogni re-enqueue della revert. Qui guardiamo solo il
--      doppio PENDING concorrente.
--
-- CREATE OR REPLACE preserva i grant → NESSUNA istruzione di grant qui.
-- Firma, SECURITY DEFINER, search_path invariati. NON modifica 20260509130000 né
-- 20260623160000. Nessun SQL dinamico (solo parametri bound). Tutto qualificato public.
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
    v_source_text   TEXT;
    v_source_hash   TEXT;
    v_deleted_count INTEGER;
BEGIN
    IF p_tenant_id IS NULL OR NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Forbidden: tenant mismatch' USING ERRCODE = '42501';
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
$$;
