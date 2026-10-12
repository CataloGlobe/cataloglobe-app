-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e l'owner di staging (UUID sotto).
-- Ogni test gira in BEGIN … ROLLBACK.
-- =============================================================================
--
-- Test — attesa delle traduzioni (migration 20261012010000)
--
-- Verifica:
--   1. il client (authenticated) che accoda un pending riceve
--      run_after = now() + translation_debounce_interval()
--   2. cambiare source_hash di un pending dal client sposta di nuovo l'attesa
--   3. il client non anticipa un lavoro scrivendo run_after (senza cambio hash)
--   4. un INSERT fuori dal client (RPC SECURITY DEFINER, qui postgres) parte
--      subito: run_after = now()
--   5. claim_pending_translation_jobs non prende i pending in attesa e prende
--      quelli scaduti
--   6. translate_now anticipa i lavori di un'entità e ritorna quanti
--   7. translate_now su un'azienda di cui non si è membri → 42501
--   8. translate_now con solo uno dei due filtri → 22023
--   9. get_translation_coverage conta 'waiting' e next_run_at (solo se 'en'
--      è attiva per McDonald's; altrimenti NOTICE di salto)
--  10. il client non anticipa passando da un altro stato (pending → failed
--      col run_after nel passato → pending); «Riprova» del client su un
--      failed già eseguito riparte subito
--  11. retry_all_failed_translations chiamata da authenticated (vera RPC
--      SECURITY DEFINER) non mette attesa
--
-- Pattern: setup via postgres role (bypass RLS) con claims service_role,
-- poi authenticated. Senza claims il trigger della quota AI
-- (get_ai_usage_current_cycle) rifiuta l'INSERT: «not a member of this tenant».
-- Dentro una transazione now() è fisso: «scaduto» = run_after nel passato
-- scritto da postgres.
--
-- Prerequisiti:
--   - lingua 'en' in supported_languages
--   - quota AI di McDonald's non bloccata (trg_enforce_ai_quota)
--   - per il test 9: almeno un prodotto McDonald's con description_hash
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres). Attesi 11
-- `NOTICE … OK` (o 10 più il salto del 9); un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper di sessione (pg_temp: spariscono a fine sessione). insert_job si
-- chiama solo da postgres: come authenticated gli INSERT sono scritti per
-- esteso, perché lo schema temporaneo è della sessione postgres.
-- -----------------------------------------------------------------------------
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

CREATE OR REPLACE FUNCTION pg_temp.as_service()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  SET LOCAL role postgres;
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L', '{"role":"service_role"}');
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.insert_job(p_entity_id text, p_hash text)
RETURNS uuid
LANGUAGE sql
AS $$
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', p_entity_id, 'description', 'en',
    'Testo di prova', p_hash, 'pending', 0
  )
  RETURNING id;
$$;

-- -----------------------------------------------------------------------------
-- TEST 1 — INSERT dal client → attesa di 10 minuti
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_run_after timestamptz;
BEGIN
  PERFORM pg_temp.as_owner();
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-1', 'description', 'en',
    'Testo di prova', 'h1', 'pending', 0
  ) RETURNING id INTO v_id;

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF v_run_after <> now() + public.translation_debounce_interval() THEN
    RAISE EXCEPTION 'Test 1 FAIL: run_after = %, atteso now() + 10 min', v_run_after;
  END IF;
  RAISE NOTICE 'Test 1 OK: pending accodato dal client in attesa fino a %', v_run_after;
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 2 — cambio di source_hash dal client → attesa spostata
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_run_after timestamptz;
BEGIN
  PERFORM pg_temp.as_service();
  v_id := pg_temp.insert_job('test-run-after-2', 'h1');
  UPDATE public.translation_jobs SET run_after = now() - interval '1 hour' WHERE id = v_id;

  PERFORM pg_temp.as_owner();
  UPDATE public.translation_jobs
     SET source_text = 'Testo cambiato', source_hash = 'h2'
   WHERE id = v_id;

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF v_run_after <> now() + public.translation_debounce_interval() THEN
    RAISE EXCEPTION 'Test 2 FAIL: run_after = %, atteso now() + 10 min', v_run_after;
  END IF;
  RAISE NOTICE 'Test 2 OK: nuovo testo, attesa ripartita';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 3 — il client non anticipa scrivendo run_after
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_run_after timestamptz;
BEGIN
  PERFORM pg_temp.as_owner();
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-3', 'description', 'en',
    'Testo di prova', 'h1', 'pending', 0
  ) RETURNING id INTO v_id;
  UPDATE public.translation_jobs SET run_after = now() - interval '1 hour' WHERE id = v_id;

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF v_run_after <> now() + public.translation_debounce_interval() THEN
    RAISE EXCEPTION 'Test 3 FAIL: il client ha spostato run_after a %', v_run_after;
  END IF;
  RAISE NOTICE 'Test 3 OK: run_after scritto dal client ignorato';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 4 — INSERT fuori dal client → parte subito
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_run_after timestamptz;
BEGIN
  PERFORM pg_temp.as_service();
  v_id := pg_temp.insert_job('test-run-after-4', 'h1');
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF v_run_after <> now() THEN
    RAISE EXCEPTION 'Test 4 FAIL: run_after = %, atteso now()', v_run_after;
  END IF;
  RAISE NOTICE 'Test 4 OK: accodamento da RPC senza attesa';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 5 — il claim salta i pending in attesa e prende quelli scaduti
-- (la lingua 'en' deve essere attiva per McDonald's, come nel claim reale:
-- la attiviamo dentro la transazione)
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_waiting uuid;
  v_due uuid;
  v_claimed uuid[];
BEGIN
  PERFORM pg_temp.as_service();
  INSERT INTO public.tenant_languages (tenant_id, language_code, is_active)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'en', true)
  ON CONFLICT (tenant_id, language_code) DO UPDATE SET is_active = true;

  v_waiting := pg_temp.insert_job('test-run-after-5a', 'h1');
  UPDATE public.translation_jobs SET run_after = now() + interval '10 minutes' WHERE id = v_waiting;
  v_due := pg_temp.insert_job('test-run-after-5b', 'h1');
  UPDATE public.translation_jobs SET run_after = now() - interval '1 minute' WHERE id = v_due;

  SELECT array_agg(c.id) INTO v_claimed
  FROM public.claim_pending_translation_jobs(100000) c;

  IF v_waiting = ANY(coalesce(v_claimed, '{}')) THEN
    RAISE EXCEPTION 'Test 5 FAIL: preso un lavoro ancora in attesa';
  END IF;
  IF NOT (v_due = ANY(coalesce(v_claimed, '{}'))) THEN
    RAISE EXCEPTION 'Test 5 FAIL: lavoro scaduto non preso';
  END IF;
  RAISE NOTICE 'Test 5 OK: claim rispetta run_after';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 6 — translate_now anticipa i lavori di un'entità
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_target uuid;
  v_other uuid;
  v_count integer;
  v_target_after timestamptz;
  v_other_after timestamptz;
BEGIN
  PERFORM pg_temp.as_owner();
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-6a', 'description', 'en',
    'Testo di prova', 'h1', 'pending', 0
  ) RETURNING id INTO v_target;
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-6b', 'description', 'en',
    'Testo di prova', 'h1', 'pending', 0
  ) RETURNING id INTO v_other;

  v_count := public.translate_now(
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-6a');

  SET LOCAL role postgres;
  SELECT run_after INTO v_target_after FROM public.translation_jobs WHERE id = v_target;
  SELECT run_after INTO v_other_after FROM public.translation_jobs WHERE id = v_other;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 6 FAIL: translate_now ha ritornato %, atteso 1', v_count;
  END IF;
  IF v_target_after > now() THEN
    RAISE EXCEPTION 'Test 6 FAIL: il lavoro scelto è ancora in attesa (%)', v_target_after;
  END IF;
  IF v_other_after <= now() THEN
    RAISE EXCEPTION 'Test 6 FAIL: anticipato anche un lavoro di un''altra entità';
  END IF;
  RAISE NOTICE 'Test 6 OK: translate_now anticipa solo l''entità scelta';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 7 — translate_now su un'azienda di cui non si è membri → 42501
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  PERFORM pg_temp.as_owner();
  BEGIN
    PERFORM public.translate_now(gen_random_uuid());
    RAISE EXCEPTION 'Test 7 FAIL: translate_now accettato su un''azienda estranea';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  RAISE NOTICE 'Test 7 OK: azienda estranea rifiutata (42501)';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 8 — translate_now con un solo filtro → 22023
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
BEGIN
  PERFORM pg_temp.as_owner();
  BEGIN
    PERFORM public.translate_now('5b37c952-1add-4196-aab3-9775d98a9c32', 'product', NULL);
    RAISE EXCEPTION 'Test 8 FAIL: accettato p_entity_type senza p_entity_id';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
  RAISE NOTICE 'Test 8 OK: filtro a metà rifiutato (22023)';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 9 — get_translation_coverage: 'waiting' e next_run_at
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_product uuid;
  v_hash text;
  v_cov jsonb;
BEGIN
  PERFORM pg_temp.as_service();
  IF NOT EXISTS (
    SELECT 1 FROM public.tenant_languages
    WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
      AND language_code = 'en' AND is_active = true
  ) THEN
    RAISE NOTICE 'Test 9 SALTATO: inglese non attivo per McDonald''s';
    RETURN;
  END IF;

  SELECT p.id, p.description_hash INTO v_product, v_hash
  FROM public.products p
  WHERE p.tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
  ORDER BY p.id
  LIMIT 1;
  IF v_product IS NULL THEN
    RAISE NOTICE 'Test 9 SALTATO: nessun prodotto McDonald''s con descrizione';
    RETURN;
  END IF;

  -- Nessun altro lavoro su quel testo, poi un pending in attesa.
  DELETE FROM public.translation_jobs
   WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
     AND entity_type = 'product' AND entity_id = v_product::text
     AND field = 'description' AND target_language_code = 'en';
  PERFORM pg_temp.insert_job(v_product::text, v_hash);
  UPDATE public.translation_jobs SET run_after = now() + interval '10 minutes'
   WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
     AND entity_type = 'product' AND entity_id = v_product::text
     AND field = 'description' AND target_language_code = 'en';

  PERFORM pg_temp.as_owner();
  v_cov := public.get_translation_coverage('5b37c952-1add-4196-aab3-9775d98a9c32');

  IF coalesce((v_cov->'en'->>'waiting')::int, 0) < 1 THEN
    RAISE EXCEPTION 'Test 9 FAIL: waiting = %, atteso >= 1', v_cov->'en'->>'waiting';
  END IF;
  IF (v_cov->'en'->>'next_run_at') IS NULL THEN
    RAISE EXCEPTION 'Test 9 FAIL: next_run_at assente';
  END IF;
  RAISE NOTICE 'Test 9 OK: copertura con % in attesa, prima partenza %',
    v_cov->'en'->>'waiting', v_cov->'en'->>'next_run_at';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 10 — niente scorciatoia passando da failed; «Riprova» parte subito
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_done uuid;
  v_run_after timestamptz;
BEGIN
  -- Pending in attesa accodato dal client, poi giro di stato a mano.
  PERFORM pg_temp.as_owner();
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-10', 'description', 'en',
    'Testo di prova', 'h1', 'pending', 0
  ) RETURNING id INTO v_id;
  UPDATE public.translation_jobs
     SET status = 'failed', run_after = now() - interval '1 hour'
   WHERE id = v_id;
  UPDATE public.translation_jobs SET status = 'pending' WHERE id = v_id;

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF v_run_after <> now() + public.translation_debounce_interval() THEN
    RAISE EXCEPTION 'Test 10 FAIL: giro di stato ha spostato run_after a %', v_run_after;
  END IF;

  -- Failed già eseguito (run_after nel passato, scritto da postgres):
  -- «Riprova» dal client lo rimette pending e parte subito.
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts, run_after
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-10b', 'description', 'en',
    'Testo di prova', 'h1', 'failed', 3, now() - interval '1 hour'
  ) RETURNING id INTO v_done;
  PERFORM pg_temp.as_owner();
  UPDATE public.translation_jobs SET status = 'pending', attempts = 0 WHERE id = v_done;

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_done;
  IF v_run_after > now() THEN
    RAISE EXCEPTION 'Test 10 FAIL: «Riprova» messo in attesa fino a %', v_run_after;
  END IF;
  RAISE NOTICE 'Test 10 OK: niente scorciatoia da failed, «Riprova» subito';
END$$;
ROLLBACK;

-- -----------------------------------------------------------------------------
-- TEST 11 — retry_all_failed_translations da authenticated: nessuna attesa
-- -----------------------------------------------------------------------------
BEGIN;
DO $$
DECLARE
  v_id uuid;
  v_run_after timestamptz;
BEGIN
  PERFORM pg_temp.as_service();
  INSERT INTO public.translation_jobs (
    tenant_id, entity_type, entity_id, field, target_language_code,
    source_text, source_hash, status, attempts, run_after
  ) VALUES (
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'product', 'test-run-after-11', 'description', 'en',
    'Testo di prova', 'h1', 'failed', 3, now() - interval '1 hour'
  ) RETURNING id INTO v_id;

  PERFORM pg_temp.as_owner();
  PERFORM public.retry_all_failed_translations('5b37c952-1add-4196-aab3-9775d98a9c32');

  SET LOCAL role postgres;
  SELECT run_after INTO v_run_after FROM public.translation_jobs WHERE id = v_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test 11 FAIL: job sparito dopo il retry';
  END IF;
  IF v_run_after > now() THEN
    RAISE EXCEPTION 'Test 11 FAIL: la RPC SECURITY DEFINER ha messo attesa fino a %', v_run_after;
  END IF;
  RAISE NOTICE 'Test 11 OK: retry da RPC senza attesa';
END$$;
ROLLBACK;
