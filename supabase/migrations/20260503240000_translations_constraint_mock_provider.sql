-- =============================================================================
-- Translations: estende CHECK constraint per ammettere provider 'mock'
-- =============================================================================
--
-- Bug scoperto al smoke test del Prompt 7 (process-translation-jobs):
-- l'upsert delle translations falliva con violazione CHECK
-- `translations_provider_check` quando MockProvider veniva selezionato
-- (TRANSLATION_PROVIDER=mock per smoke test fase A).
--
-- Causa: il provider whitelist nelle CHECK constraint create al Prompt 2
-- (translations.provider) e Prompt 1 (supported_languages.provider_preference)
-- ammetteva solo `deepl | google | manual | system`. Il MockProvider
-- (Prompt 6) si dichiara con name='mock', valore non whitelisted → 23514.
--
-- Fix retroattivo: estendere ENTRAMBE le CHECK ad ammettere 'mock' come
-- provider di prima classe. Coerente col design del provider abstraction
-- layer (MockProvider è inteso per test/dev — può comunque scrivere su DB
-- con audit trail distinto).
--
-- Idempotente: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (pattern già
-- usato in altre migration del progetto). Re-applicabile senza danno.
--
-- Ref: docs/translations-architecture-v3.md sez. 5.2, 6.3.
-- =============================================================================


-- 1. translations.provider_check ----------------------------------------------

ALTER TABLE public.translations
    DROP CONSTRAINT IF EXISTS translations_provider_check;

ALTER TABLE public.translations
    ADD CONSTRAINT translations_provider_check
    CHECK (provider IN ('deepl', 'google', 'manual', 'system', 'mock'));


-- 2. supported_languages.provider_preference_check ---------------------------

ALTER TABLE public.supported_languages
    DROP CONSTRAINT IF EXISTS supported_languages_provider_preference_check;

ALTER TABLE public.supported_languages
    ADD CONSTRAINT supported_languages_provider_preference_check
    CHECK (provider_preference IN ('deepl', 'google', 'manual', 'system', 'mock'));
