-- =============================================================================
-- Translations backfill: allergens (Prompt 3 di 24)
-- =============================================================================
--
-- Migra `allergens` dal pattern bilingue legacy (label_it + label_en) al
-- pattern unificato `translations` (Q10).
--
-- Strategia rolling deploy:
--   - Step 1-2: INSERT in translations le seed IT/EN (provider='system',
--               status='manual', tenant_id=NULL).
--   - Step 3:   ADD COLUMN allergens.label TEXT, populate da label_it,
--               poi NOT NULL.
--   - Step 4:   Popola allergens.label_hash via canonical form
--               sha256(lower(trim(label))).
--   - Step 5:   COMMENT su nuove + legacy columns.
--
-- NIENTE DROP di label_it / label_en in questa migration: il drop avviene
-- al Prompt 15, dopo che resolver (Prompt 13) e ResolvedProductAllergen
-- (Prompt 14) sono refactored su `label`.
--
-- Idempotenza: ON CONFLICT DO NOTHING su translations, ADD COLUMN IF NOT
-- EXISTS, UPDATE WHERE IS NULL su label e label_hash. Re-applicabile senza
-- danno.
--
-- Pre-flight verificato in chat:
--   - 14 allergens
--   - 0 con label_it/label_en null/empty
--   - 0 translations preesistenti per allergen
--   - 0 label_hash già popolati
--
-- Ref: docs/translations-architecture-v3.md sezioni 4.3.1, 4.3.3, 4.3.4, 6.5.
-- =============================================================================


-- 1. INSERT translations IT ---------------------------------------------------
--
-- entity_id = a.id::text (allergens.id è SMALLINT, ma translations.entity_id
-- è TEXT per uniformità con composite keys di altre entity_type).
-- canonical hash = sha256(lower(trim(label_it))) — pattern allineato a
-- hashUtils.ts (Prompt 5) e sez. 6.5 v3.

INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
)
SELECT
    NULL,                                                            -- system entity (cross-tenant)
    'allergen',
    a.id::text,
    'label',
    'it',
    a.label_it,
    encode(sha256(lower(trim(a.label_it))::bytea), 'hex'),
    a.label_it,                                                      -- IT è lingua sorgente
    'system',
    'manual'
FROM public.allergens a
ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
DO NOTHING;


-- 2. INSERT translations EN ---------------------------------------------------
--
-- provider='system', status='manual' anche per EN: queste sono curate dalla
-- piattaforma, non auto-generate via DeepL. Il job processor non le
-- rigenererà (UNIQUE constraint + ON CONFLICT DO NOTHING).

INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
)
SELECT
    NULL,
    'allergen',
    a.id::text,
    'label',
    'en',
    a.label_it,                                                      -- source_text resta in lingua sorgente
    encode(sha256(lower(trim(a.label_it))::bytea), 'hex'),           -- hash sulla source (it)
    a.label_en,                                                      -- target è la EN già curata
    'system',
    'manual'
FROM public.allergens a
ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
DO NOTHING;


-- 3. ADD COLUMN allergens.label + populate + NOT NULL -------------------------

ALTER TABLE public.allergens
    ADD COLUMN IF NOT EXISTS label TEXT;

UPDATE public.allergens
SET label = label_it
WHERE label IS NULL;

-- SET NOT NULL solo dopo che la popolazione è completa. Idempotent: se la
-- colonna è già NOT NULL, l'ALTER è no-op (PostgreSQL accetta).
ALTER TABLE public.allergens
    ALTER COLUMN label SET NOT NULL;


-- 4. Popolazione label_hash --------------------------------------------------

UPDATE public.allergens
SET label_hash = encode(sha256(lower(trim(label))::bytea), 'hex')
WHERE label_hash IS NULL;


-- 5. COMMENT esplicativi -----------------------------------------------------

COMMENT ON COLUMN public.allergens.label IS
    'Label canonica nella lingua sorgente piattaforma (it). Lookup multi-lingua '
    'via translations table (entity_type=allergen, field=label). Le colonne '
    'label_it / label_en sono LEGACY e verranno droppate al Prompt 15 dopo '
    'che resolver + servizi sono migrati alla nuova convention.';

COMMENT ON COLUMN public.allergens.label_it IS
    'LEGACY (drop pianificato al Prompt 15). Mantenuta finché il resolver '
    'pubblico e ResolvedProductAllergen.label_it non sono refattorati al '
    'Prompt 14. NON usare in nuovo codice — usare allergens.label + '
    'translations.';

COMMENT ON COLUMN public.allergens.label_en IS
    'LEGACY (drop pianificato al Prompt 15). Già migrata in translations '
    'come row system per language_code=en.';
