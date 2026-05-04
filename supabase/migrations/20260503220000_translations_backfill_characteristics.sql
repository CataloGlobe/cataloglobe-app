-- =============================================================================
-- Translations backfill: product_characteristics (Prompt 3b di 24)
-- =============================================================================
--
-- Migra `product_characteristics` dal pattern bilingue legacy (label_it +
-- label_en) al pattern unificato `translations` (Q-CN3, allineamento con
-- allergens — Prompt 3).
--
-- Strategia rolling deploy:
--   - Step 1-2: INSERT in translations le seed IT/EN (provider='system',
--               status='manual', tenant_id=NULL).
--   - Step 3:   ADD COLUMN product_characteristics.label TEXT, populate da
--               label_it, poi NOT NULL.
--   - Step 4:   Popola product_characteristics.label_hash via canonical form
--               sha256(lower(trim(label))).
--   - Step 5:   COMMENT su nuove + legacy columns.
--
-- NIENTE DROP di label_it / label_en in questa migration: il drop avviene
-- al Prompt 15, dopo che resolver (Prompt 13) e ResolvedProductCharacteristic
-- (Prompt 14) sono refactored su `label`.
--
-- Pre-flight verificato in chat:
--   - 31 characteristics
--   - 0 con label_it/label_en null/empty
--   - 0 translations preesistenti per characteristic
--   - 0 label_hash già popolati
--   - Schema id verificato: UUID (NON smallint come allergens — entity_id
--     sarà UUID stringificato; cast id::text valido).
--
-- Idempotenza: ON CONFLICT DO NOTHING su translations, ADD COLUMN IF NOT
-- EXISTS, UPDATE WHERE IS NULL su label e label_hash. Re-applicabile.
--
-- Ref: docs/translations-architecture-v3.md sez. 4.3.2, 4.3.3, 4.3.4, 6.5.
-- Pattern parallelo a Prompt 3 (allergens) — stessa logica, target diversa.
-- =============================================================================


-- 1. INSERT translations IT ---------------------------------------------------

INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
)
SELECT
    NULL,                                                            -- system entity (cross-tenant)
    'characteristic',
    c.id::text,                                                      -- UUID stringificato
    'label',
    'it',
    c.label_it,
    encode(sha256(lower(trim(c.label_it))::bytea), 'hex'),
    c.label_it,                                                      -- IT è lingua sorgente
    'system',
    'manual'
FROM public.product_characteristics c
ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
DO NOTHING;


-- 2. INSERT translations EN ---------------------------------------------------

INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
)
SELECT
    NULL,
    'characteristic',
    c.id::text,
    'label',
    'en',
    c.label_it,                                                      -- source_text resta in lingua sorgente
    encode(sha256(lower(trim(c.label_it))::bytea), 'hex'),           -- hash sulla source (it)
    c.label_en,                                                      -- target è la EN già curata
    'system',
    'manual'
FROM public.product_characteristics c
ON CONFLICT (tenant_id, entity_type, entity_id, field, language_code)
DO NOTHING;


-- 3. ADD COLUMN product_characteristics.label + populate + NOT NULL -----------

ALTER TABLE public.product_characteristics
    ADD COLUMN IF NOT EXISTS label TEXT;

UPDATE public.product_characteristics
SET label = label_it
WHERE label IS NULL;

ALTER TABLE public.product_characteristics
    ALTER COLUMN label SET NOT NULL;


-- 4. Popolazione label_hash --------------------------------------------------

UPDATE public.product_characteristics
SET label_hash = encode(sha256(lower(trim(label))::bytea), 'hex')
WHERE label_hash IS NULL;


-- 5. COMMENT esplicativi -----------------------------------------------------

COMMENT ON COLUMN public.product_characteristics.label IS
    'Label canonica nella lingua sorgente piattaforma (it). Lookup multi-lingua '
    'via translations table (entity_type=characteristic, field=label). Le colonne '
    'label_it / label_en sono LEGACY e verranno droppate al Prompt 15 dopo '
    'che resolver + servizi sono migrati alla nuova convention.';

COMMENT ON COLUMN public.product_characteristics.label_it IS
    'LEGACY (drop pianificato al Prompt 15). Mantenuta finché il resolver '
    'pubblico e ResolvedProductCharacteristic.label_it non sono refattorati al '
    'Prompt 14. NON usare in nuovo codice — usare product_characteristics.label '
    '+ translations.';

COMMENT ON COLUMN public.product_characteristics.label_en IS
    'LEGACY (drop pianificato al Prompt 15). Già migrata in translations '
    'come row system per language_code=en.';
