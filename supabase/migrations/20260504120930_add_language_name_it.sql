-- =============================================================================
-- Prompt 20 hotfix — Aggiunge supported_languages.name_it
-- =============================================================================
--
-- Scope: nome lingua in italiano per UI admin (operatore IT). Distinto da
-- name_native (usato dal LanguageSelector pubblico, dove l'utente finale
-- vede la propria lingua nel suo idioma) e name_en (debug/inglese).
--
-- Strategy:
--   1. ADD COLUMN nullable.
--   2. UPDATE valori curated [it,en,fr,de,es] manualmente.
--   3. UPDATE fallback name_it = name_en per le 28 non curate.
--   4. SET NOT NULL post-populate.
-- =============================================================================

ALTER TABLE public.supported_languages
ADD COLUMN IF NOT EXISTS name_it TEXT;

UPDATE public.supported_languages SET name_it = 'Italiano' WHERE code = 'it';
UPDATE public.supported_languages SET name_it = 'Inglese'  WHERE code = 'en';
UPDATE public.supported_languages SET name_it = 'Francese' WHERE code = 'fr';
UPDATE public.supported_languages SET name_it = 'Tedesco'  WHERE code = 'de';
UPDATE public.supported_languages SET name_it = 'Spagnolo' WHERE code = 'es';

UPDATE public.supported_languages
SET name_it = name_en
WHERE name_it IS NULL;

ALTER TABLE public.supported_languages
ALTER COLUMN name_it SET NOT NULL;
