-- =============================================================================
-- Prompt 23 — Hash backfill ONE-SHOT
-- =============================================================================
--
-- Scope: popola le colonne *_hash dove NULL ma il field source è non-null,
-- su TUTTI i tenant esistenti.
--
-- Uso: eseguire UNA VOLTA da SQL Editor (Dashboard → SQL Editor).
--   Copia/incolla l'intero file ed esegui.
--
-- Risolve: tenant esistenti pre-pipeline traduzioni hanno *.field popolato
-- ma *.field_hash NULL → la RPC enqueue_tenant_language_backfill (Prompt 20)
-- li skippa perché filtra per *.field_hash IS NOT NULL. Dopo questo backfill,
-- gli hash sono popolati e i tenant possono attivare lingue normalmente.
--
-- Idempotente: skip righe con hash già popolato. Re-run sicuro.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASH FUNCTION — MUST MATCH src/services/translation/hashUtils.ts
-- ─────────────────────────────────────────────────────────────────────────────
-- App canonical form: text.trim().toLowerCase() → SHA-256 hex.
-- SQL equivalent:     encode(extensions.digest(lower(trim(<field>))::bytea, 'sha256'), 'hex')
--
-- Verifica MANUALE su staging confermata 2026-05-04:
--   description = 'Toast con granella...'
--   description_hash (computed by app) = 'b8dac81c...'
--   encode(extensions.digest(lower(trim(description))::bytea, 'sha256'), 'hex') = 'b8dac81c...'  ✓ MATCH
--
-- pgcrypto vive nello schema `extensions` (NON public): qualifica obbligatoria
-- `extensions.digest()`. Già installato su staging/prod, niente CREATE EXTENSION.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COVERAGE
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. products.description     → description_hash
-- 2. catalog_categories.name  → name_hash
-- 3. ingredients.name         → name_hash
-- 4. product_option_groups.name   → name_hash
-- 5. product_option_values.name   → name_hash
-- 6. featured_contents.title       → title_hash
-- 7. featured_contents.subtitle    → subtitle_hash
-- 8. featured_contents.description → description_hash
-- 9. featured_contents.cta_text    → cta_text_hash
-- 10. activity_closures.label  → label_hash
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EXCLUSIONI INTENZIONALI
-- ─────────────────────────────────────────────────────────────────────────────
-- products.notes / notes_hash:
--   La canonical form è JSONB-specific:
--     JSON.stringify(notes.map(n => ({label: trim(n.label), value: trim(n.value)})))
--   Replicare in SQL è fragile (key ordering, whitespace, jsonb→text edge case).
--   Workaround per tenant pre-pipeline: l'admin deve aprire e risalvare il
--   prodotto (anche senza modifiche) per innescare il service hook che
--   computa notes_hash via computeNotesHash() e popola la colonna.
--   Impact basso: in staging 1 sola riga affetta.
--
-- System tables (allergens, product_characteristics):
--   Out of scope. Hash gestito da Prompt 3+3b migrations.
--
-- Vertical-skip tables (product_attribute_*, product_variant_*):
--   Out of scope. Hash NON usato dalla pipeline traduzioni F&B.
--
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1. products.description_hash ────────────────────────────────────────────
WITH updated AS (
    UPDATE public.products
    SET description_hash = encode(extensions.digest(lower(trim(description))::bytea, 'sha256'), 'hex')
    WHERE description IS NOT NULL
      AND length(trim(description)) > 0
      AND description_hash IS NULL
    RETURNING 1
)
SELECT 'products.description_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 2. catalog_categories.name_hash ─────────────────────────────────────────
WITH updated AS (
    UPDATE public.catalog_categories
    SET name_hash = encode(extensions.digest(lower(trim(name))::bytea, 'sha256'), 'hex')
    WHERE name IS NOT NULL
      AND length(trim(name)) > 0
      AND name_hash IS NULL
    RETURNING 1
)
SELECT 'catalog_categories.name_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 3. ingredients.name_hash ────────────────────────────────────────────────
WITH updated AS (
    UPDATE public.ingredients
    SET name_hash = encode(extensions.digest(lower(trim(name))::bytea, 'sha256'), 'hex')
    WHERE name IS NOT NULL
      AND length(trim(name)) > 0
      AND name_hash IS NULL
    RETURNING 1
)
SELECT 'ingredients.name_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 4. product_option_groups.name_hash ──────────────────────────────────────
WITH updated AS (
    UPDATE public.product_option_groups
    SET name_hash = encode(extensions.digest(lower(trim(name))::bytea, 'sha256'), 'hex')
    WHERE name IS NOT NULL
      AND length(trim(name)) > 0
      AND name_hash IS NULL
    RETURNING 1
)
SELECT 'product_option_groups.name_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 5. product_option_values.name_hash ──────────────────────────────────────
WITH updated AS (
    UPDATE public.product_option_values
    SET name_hash = encode(extensions.digest(lower(trim(name))::bytea, 'sha256'), 'hex')
    WHERE name IS NOT NULL
      AND length(trim(name)) > 0
      AND name_hash IS NULL
    RETURNING 1
)
SELECT 'product_option_values.name_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 6. featured_contents.title_hash ─────────────────────────────────────────
WITH updated AS (
    UPDATE public.featured_contents
    SET title_hash = encode(extensions.digest(lower(trim(title))::bytea, 'sha256'), 'hex')
    WHERE title IS NOT NULL
      AND length(trim(title)) > 0
      AND title_hash IS NULL
    RETURNING 1
)
SELECT 'featured_contents.title_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 7. featured_contents.subtitle_hash ──────────────────────────────────────
WITH updated AS (
    UPDATE public.featured_contents
    SET subtitle_hash = encode(extensions.digest(lower(trim(subtitle))::bytea, 'sha256'), 'hex')
    WHERE subtitle IS NOT NULL
      AND length(trim(subtitle)) > 0
      AND subtitle_hash IS NULL
    RETURNING 1
)
SELECT 'featured_contents.subtitle_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 8. featured_contents.description_hash ───────────────────────────────────
WITH updated AS (
    UPDATE public.featured_contents
    SET description_hash = encode(extensions.digest(lower(trim(description))::bytea, 'sha256'), 'hex')
    WHERE description IS NOT NULL
      AND length(trim(description)) > 0
      AND description_hash IS NULL
    RETURNING 1
)
SELECT 'featured_contents.description_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 9. featured_contents.cta_text_hash ──────────────────────────────────────
WITH updated AS (
    UPDATE public.featured_contents
    SET cta_text_hash = encode(extensions.digest(lower(trim(cta_text))::bytea, 'sha256'), 'hex')
    WHERE cta_text IS NOT NULL
      AND length(trim(cta_text)) > 0
      AND cta_text_hash IS NULL
    RETURNING 1
)
SELECT 'featured_contents.cta_text_hash' AS field, COUNT(*) AS rows_updated FROM updated;

-- ── 10. activity_closures.label_hash ────────────────────────────────────────
WITH updated AS (
    UPDATE public.activity_closures
    SET label_hash = encode(extensions.digest(lower(trim(label))::bytea, 'sha256'), 'hex')
    WHERE label IS NOT NULL
      AND length(trim(label)) > 0
      AND label_hash IS NULL
    RETURNING 1
)
SELECT 'activity_closures.label_hash' AS field, COUNT(*) AS rows_updated FROM updated;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- POST-EXECUTION CHECKLIST
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Verifica counts dei messaggi sopra. Se rows_updated > 0 per qualche
--    tabella → contenuti pre-pipeline trovati e hashati.
--
-- 2. Per ogni tenant interessato, scegli UNA strategia per innescare i jobs
--    di traduzione sui contenuti appena hashati:
--
--    a) Manuale via UI: tenant admin → Settings → Lingue → disattiva e
--       riattiva ogni lingua → triggera RPC enqueue_tenant_language_backfill.
--
--    b) SQL admin per ogni (tenant_id, lang_code) attivo:
--       SELECT public.enqueue_tenant_language_backfill(
--           '<tenant_uuid>'::uuid,
--           '<lang_code>'
--       );
--
--    c) Loop SQL su tutti tenant_languages attivi (raccomandato post-launch):
--       DO $$
--       DECLARE r RECORD;
--       BEGIN
--           FOR r IN
--               SELECT tenant_id, language_code
--               FROM public.tenant_languages
--               WHERE is_active = true
--           LOOP
--               PERFORM public.enqueue_tenant_language_backfill(r.tenant_id, r.language_code);
--           END LOOP;
--       END $$;
--
-- 3. Cron processa progressivamente (~2 min/batch).
--
-- 4. NOTE products.notes_hash: skippato dallo script (canonical JSONB form
--    troppo fragile in SQL). Tenant deve aprire e risalvare i prodotti che
--    usano notes per innescare il service hook (computeNotesHash). In staging
--    solo 1 riga affetta.
-- =============================================================================
