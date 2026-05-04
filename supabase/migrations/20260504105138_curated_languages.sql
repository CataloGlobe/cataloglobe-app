-- =============================================================================
-- Prompt 20 — Curated languages whitelist
-- =============================================================================
--
-- Scope: limita supported_languages.is_available=true SOLO alle 5 lingue
-- supportate al lancio: it (base), en, fr, de, es. Le altre 28 restano
-- nella tabella ma non visibili lato UI admin (Settings → Lingue).
--
-- Reversibile: per riabilitare basta UPDATE is_available=true sulla lingua
-- che si vuole esporre.
-- =============================================================================

UPDATE public.supported_languages
SET is_available = false
WHERE code <> ALL (ARRAY['it', 'en', 'fr', 'de', 'es']);

UPDATE public.supported_languages
SET is_available = true
WHERE code = ANY (ARRAY['it', 'en', 'fr', 'de', 'es']);
