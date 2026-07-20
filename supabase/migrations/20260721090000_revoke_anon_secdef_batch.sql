-- Hardening SECDEF: chiude il warning Advisor "function is callable by anon/PUBLIC"
-- per 10 funzioni SECURITY DEFINER (purge_user_data escluso: gia' service_role-only,
-- search_path gia' '' via 20260429140000_harden_function_search_path.sql).
--
-- REVOKE-only, nessun CREATE FUNCTION -> nessun rischio 42601 (regola CLAUDE.md).
--
-- Mappa chiamanti (FASE 1, audit 2026-07-21):
--   replace_product_allergens/_characteristics/_ingredients -> FE admin autenticato
--     (src/services/supabase/allergens.ts, productCharacteristics.ts, ingredients.ts)
--   upsert_auto_translation -> SOLO worker cron process-translation-jobs (service_role)
--   upsert_manual_translation / revert_manual_translation -> FE admin autenticato
--     (src/services/supabase/translations.ts)
--   retry_all_failed_translations / get_translation_coverage / get_translation_progress
--     -> FE admin autenticato (src/services/supabase/tenantLanguages.ts)
--   get_schedule_featured_contents -> FE admin autenticato (resolveActivityCatalogs.ts,
--     usato solo da pagine dashboard: BusinessList/BusinessCard/ActivityAvailabilityTab/
--     CreateOrderDrawer) + edge resolve-public-catalog (client service_role, NON anon).
--     Aveva un GRANT anon esplicito da 20260409120000 (stub iniziale, mai rimosso nei
--     refactor successivi) -> revocato qui, pagina pubblica non lo usa via anon.
--
-- Le funzioni "REVOKE ALL/EXECUTE FROM PUBLIC" gia' presenti nei file di creazione non
-- bastavano: Supabase pre-grant EXECUTE a anon/authenticated/service_role via default
-- privileges a CREATE FUNCTION time, indipendente dal REVOKE FROM PUBLIC esplicito
-- (vedi CLAUDE.md ## Funzioni SQL). Serve REVOKE esplicito FROM anon per ciascuna.

BEGIN;

REVOKE ALL ON FUNCTION public.replace_product_allergens(UUID, UUID, INT[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_product_characteristics(UUID, UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.replace_product_ingredients(UUID, UUID, UUID[]) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.upsert_auto_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revert_manual_translation(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.retry_all_failed_translations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_translation_coverage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_translation_progress(uuid) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.get_schedule_featured_contents(uuid, uuid) FROM PUBLIC, anon;

-- Grant invariati per authenticated/service_role dove gia' presenti (non toccati sopra):
-- replace_product_* -> authenticated (atomic_product_setters.sql)
-- upsert_manual_translation / revert_manual_translation -> authenticated
-- retry_all_failed_translations / get_translation_coverage / get_translation_progress -> authenticated
-- get_schedule_featured_contents -> authenticated, service_role
-- upsert_auto_translation: authenticated esplicitamente revocato sopra (mai stato chiamante
-- legittimo, solo service_role dal worker) -> resta service_role invariato.

COMMIT;
