-- FASE 2b — Guard lingue inattive nel claim dei translation jobs
--
-- Problema (zona grigia #2, audit Lingue/Traduzioni FASE 1):
-- claim_pending_translation_jobs claimava QUALSIASI job 'pending' senza verificare
-- tenant_languages.is_active per la lingua target. Risultato: un job pending per una
-- lingua disattivata veniva claimato, il worker chiamava DeepL e bruciava quota per una
-- lingua non piu' attiva. Il toggle-off (is_active=false) NON cancella i job in coda.
--
-- Fix (single-concern): aggiungere al predicato di selezione del claim una guard che
-- ammette solo job la cui lingua target e' ATTIVA per quel tenant. Il consumo viene
-- evitato a monte (nel claim) invece di sprecato nel worker.
--
-- Job di sistema (tenant_id IS NULL: allergen/characteristic/attr_def/attr_def_option)
-- NON sono tenant-scoped e non hanno righe in tenant_languages: restano sempre eleggibili
-- (j.tenant_id IS NULL passa la guard) per evitare regressioni sulle traduzioni di sistema.
--
-- Comportamento risultante:
--   - Lingua attiva       -> job claimato e processato come prima (nessuna regressione).
--   - Lingua disattivata  -> job NON claimato, resta 'pending', DeepL mai chiamato.
--   - Riattivazione lingua -> i job pending tornano eleggibili e riprendono naturalmente.
--
-- CREATE OR REPLACE preserva i grant esistenti (REVOKE/GRANT definiti in
-- 20260503230000_translations_pg_cron.sql): nessuno statement GRANT/REVOKE qui.
-- Cambia SOLO il predicato di selezione; firma, RETURNS, SECURITY DEFINER, search_path,
-- FOR UPDATE SKIP LOCKED, transizione pending->processing e RETURNING invariati.

CREATE OR REPLACE FUNCTION public.claim_pending_translation_jobs(p_limit INTEGER)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    entity_type TEXT,
    entity_id TEXT,
    field TEXT,
    target_language_code TEXT,
    source_text TEXT,
    source_hash TEXT,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    RETURN QUERY
    UPDATE public.translation_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1
    WHERE j.id IN (
        SELECT j2.id
        FROM public.translation_jobs j2
        WHERE j2.status = 'pending'
          AND (
              j2.tenant_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public.tenant_languages tl
                  WHERE tl.tenant_id = j2.tenant_id
                    AND tl.language_code = j2.target_language_code
                    AND tl.is_active = true
              )
          )
        ORDER BY j2.created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING j.id,
              j.tenant_id,
              j.entity_type,
              j.entity_id,
              j.field,
              j.target_language_code,
              j.source_text,
              j.source_hash,
              j.attempts;
END;
$$;
