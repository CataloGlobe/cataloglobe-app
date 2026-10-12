-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e l'owner di staging (UUID sotto).
-- Ogni test gira in BEGIN … ROLLBACK.
-- =============================================================================
--
-- Test — conteggio per la conferma all'accensione di una lingua
-- (migration 20261012020000)
--
-- Verifica:
--   1. count_tenant_language_backfill conta i testi senza traduzione
--      aggiornata, anche per una lingua non attiva
--   2. una traduzione con l'hash corrente toglie il testo dal conteggio;
--      una con l'hash vecchio no
--   3. azienda di cui non si è membri → 42501
--   4. lingua fuori catalogo → 22023
--
-- Prerequisiti:
--   - lingua 'en' in supported_languages (is_available)
--   - almeno un prodotto McDonald's con description e description_hash
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres). Attesi 4
-- `NOTICE … OK`; un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.as_owner()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    '{"sub":"9603ef2a-9f9d-4ebc-8d05-3b2600e36e49","role":"authenticated"}');
  SET LOCAL role authenticated;
END;
$$;

-- -----------------------------------------------------------------------------
-- TEST 1 + 2 — conteggio, anche con la lingua spenta; l'hash decide
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_product uuid;
  v_hash text;
  v_before integer;
  v_after integer;
BEGIN
  SET LOCAL role postgres;
  SELECT p.id, p.description_hash INTO v_product, v_hash
  FROM public.products p
  WHERE p.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
  LIMIT 1;
  IF v_product IS NULL THEN
    RAISE EXCEPTION 'Test 1 FAIL: nessun prodotto McDonald''s con descrizione';
  END IF;

  -- Lingua spenta e nessuna traduzione inglese di quella descrizione.
  UPDATE public.tenant_languages SET is_active = false
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32' AND language_code = 'en';
  DELETE FROM public.translations
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_type = 'product' AND entity_id = v_product::text
    AND field = 'description' AND language_code = 'en';

  PERFORM pg_temp.as_owner();
  v_before := public.count_tenant_language_backfill('5b37c952-1add-4196-aab3-9775d98a9c32', 'en');
  IF v_before < 1 THEN
    RAISE EXCEPTION 'Test 1 FAIL: conteggio % con una descrizione da tradurre', v_before;
  END IF;
  RAISE NOTICE 'Test 1 OK: % testi da tradurre in inglese (lingua spenta)', v_before;

  -- Traduzione con l'hash vecchio: il testo resta da tradurre.
  SET LOCAL role postgres;
  INSERT INTO public.translations (
    tenant_id, entity_type, entity_id, field, language_code,
    source_text, source_hash, translated_text, provider, status
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', v_product::text,
    'description', 'en', 'vecchio', 'hash-vecchio', 'old', 'deepl', 'auto'
  );
  PERFORM pg_temp.as_owner();
  v_after := public.count_tenant_language_backfill('5b37c952-1add-4196-aab3-9775d98a9c32', 'en');
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'Test 2 FAIL: hash vecchio tolto dal conteggio (% → %)', v_before, v_after;
  END IF;

  -- Con l'hash corrente il testo esce dal conteggio.
  SET LOCAL role postgres;
  UPDATE public.translations SET source_hash = v_hash
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND entity_type = 'product' AND entity_id = v_product::text
    AND field = 'description' AND language_code = 'en';
  PERFORM pg_temp.as_owner();
  v_after := public.count_tenant_language_backfill('5b37c952-1add-4196-aab3-9775d98a9c32', 'en');
  IF v_after <> v_before - 1 THEN
    RAISE EXCEPTION 'Test 2 FAIL: atteso %, ottenuto %', v_before - 1, v_after;
  END IF;
  RAISE NOTICE 'Test 2 OK: conta solo le traduzioni con l''hash corrente';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — azienda di cui non si è membri → 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  PERFORM pg_temp.as_owner();
  BEGIN
    PERFORM public.count_tenant_language_backfill(gen_random_uuid(), 'en');
    RAISE EXCEPTION 'Test 3 FAIL: conteggio concesso su un''azienda estranea';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'Test 3 OK: azienda estranea rifiutata (42501)';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — lingua fuori catalogo → 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  PERFORM pg_temp.as_owner();
  BEGIN
    PERFORM public.count_tenant_language_backfill('5b37c952-1add-4196-aab3-9775d98a9c32', 'xx');
    RAISE EXCEPTION 'Test 4 FAIL: lingua inesistente accettata';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'Test 4 OK: lingua fuori catalogo rifiutata (22023)';
END$$;
ROLLBACK;
