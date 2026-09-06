-- =============================================================================
-- Allergeni #1 e #12 — allineamento alla forma breve ufficiale
-- =============================================================================
--
-- Reg. UE 1169/2011, Allegato II. Gli altri 12 allergeni usano già la forma
-- breve ("Crostacei", "Uova", "Latte"…); #1 e #12 erano rimasti sulla forma
-- estesa, in disaccordo con la legenda PDF (`src/services/pdf/allergenEuNumbers.ts`,
-- che già usa "Glutine" / "Solfiti"). Due nomi diversi per lo stesso allergene
-- tra pagina pubblica e PDF esportato.
--
--   #1  (code 'gluten')    "Cereali contenenti glutine"   → "Glutine"
--   #12 (code 'sulphites') "Anidride solforosa e solfiti" → "Solfiti"
--
-- ── Perché la migration tocca ANCHE label_it (e non solo label) ──────────────
--
-- `allergens.label` è la colonna canonica del sistema traduzioni, ma NON è la
-- colonna letta a runtime dalla pagina pubblica. Entrambi i gemelli del
-- resolver selezionano ancora la colonna LEGACY `label_it`:
--
--   supabase/functions/_shared/resolveActivityCatalogs.ts:529
--   src/services/supabase/resolveActivityCatalogs.ts:519  (+ SELECT riga 938)
--
-- e `resolve-public-catalog/index.ts:37` salta del tutto la RPC di traduzione
-- quando `lang = base_language`. Quindi per un tenant IT (base 'it') l'etichetta
-- mostrata viene da `allergens.label_it` senza passare da `translations`.
-- Aggiornare solo `label` sarebbe un no-op invisibile in produzione.
--
-- Il drop di label_it/label_en era pianificato al "Prompt 15" ma non è mai
-- avvenuto (le colonne esistono ancora, il resolver le usa ancora): finché
-- vivono vanno tenute allineate. Nessuna modifica a id / code / sort_order.
--
-- ── Perché la migration accoda i translation_jobs a mano ────────────────────
--
-- Nessun trigger su `public.allergens` (verificato: pg_trigger vuoto). L'hash
-- e l'accodamento job non sono automatici per una UPDATE SQL diretta → caso (b):
-- ricalcolo `label_hash` + INSERT esplicito in `translation_jobs` qui dentro.
-- Formula hash canonica identica a hashUtils.ts / backfill Prompt 3:
--   encode(sha256(lower(trim(label))::bytea), 'hex')
--
-- Le righe `translations` per le 31 lingue auto NON sono toccate a mano: le
-- rigenera il cron `process-translation-jobs` dai job accodati qui (~2 min).
-- Fanno eccezione le due righe di sistema curate a mano:
--   - 'it' → è la lingua sorgente, va riallineata qui per definizione;
--   - 'en' → status='manual', e `upsert_auto_translation` esce con RETURN FALSE
--            sulle righe manual: un job EN non la sovrascriverebbe mai. Va
--            aggiornata qui o resterebbe permanentemente sulla forma estesa.
-- Per questo l'accodamento job esclude 'it' e 'en' (31 lingue, non 32): un job
-- EN sarebbe una chiamata DeepL sprecata, scartata dal guard manual.
--
-- Il gate quota AI su translation_jobs (trg_enforce_ai_quota) esenta le righe
-- platform con tenant_id IS NULL — questi job passano.
--
-- Idempotenza: UPDATE a valori fissi (ri-eseguibili), INSERT job con gli stessi
-- guard NOT EXISTS del backfill Prompt 22 (skip se job pending/done o
-- translation già allineata sul nuovo source_hash).
-- =============================================================================


-- 1. allergens: label canonica + label_it legacy + hash ----------------------

UPDATE public.allergens
SET label     = 'Glutine',
    label_it  = 'Glutine',
    label_hash = encode(sha256(lower(trim('Glutine'))::bytea), 'hex')
WHERE code = 'gluten';

UPDATE public.allergens
SET label     = 'Solfiti',
    label_it  = 'Solfiti',
    label_hash = encode(sha256(lower(trim('Solfiti'))::bytea), 'hex')
WHERE code = 'sulphites';


-- 2. translations: riga sorgente 'it' ----------------------------------------
--
-- source_text = translated_text: 'it' è la lingua sorgente (pattern del
-- backfill Prompt 3). provider/status restano system/manual.

UPDATE public.translations t
SET source_text     = a.label,
    source_hash     = a.label_hash,
    translated_text = a.label,
    updated_at      = now()
FROM public.allergens a
WHERE t.tenant_id IS NULL
  AND t.entity_type = 'allergen'
  AND t.field = 'label'
  AND t.language_code = 'it'
  AND t.entity_id = a.id::text
  AND a.code IN ('gluten', 'sulphites');


-- 3. translations: riga 'en' curata dalla piattaforma ------------------------
--
-- Forma breve coerente con la legenda PDF IT. source_text/source_hash seguono
-- la nuova sorgente IT, così il job processor considera la riga aggiornata.

UPDATE public.translations t
SET source_text     = a.label,
    source_hash     = a.label_hash,
    translated_text = CASE a.code
                          WHEN 'gluten'    THEN 'Gluten'
                          WHEN 'sulphites' THEN 'Sulphites'
                      END,
    updated_at      = now()
FROM public.allergens a
WHERE t.tenant_id IS NULL
  AND t.entity_type = 'allergen'
  AND t.field = 'label'
  AND t.language_code = 'en'
  AND t.entity_id = a.id::text
  AND a.code IN ('gluten', 'sulphites');


-- 4. translation_jobs: riaccodo le 31 lingue auto ----------------------------
--
-- tenant_id NULL = system entity cross-tenant (esente dal gate quota).
-- Guard identici a enqueue_platform_languages_backfill (Prompt 22).

INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status
)
SELECT
    NULL, 'allergen', a.id::text, 'label', sl.code,
    a.label, a.label_hash, 'pending'
FROM public.allergens a
CROSS JOIN public.supported_languages sl
WHERE a.code IN ('gluten', 'sulphites')
  AND sl.code NOT IN ('it', 'en')
  AND NOT EXISTS (
      SELECT 1 FROM public.translation_jobs tj
      WHERE tj.tenant_id IS NULL
        AND tj.entity_type = 'allergen'
        AND tj.entity_id = a.id::text
        AND tj.field = 'label'
        AND tj.target_language_code = sl.code
        AND tj.source_hash = a.label_hash
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
