-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e gli utenti test.* di staging (UUID sotto).
-- Ogni test gira fra SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con
-- ROLLBACK: nessuna riga reale resta modificata.
-- =============================================================================
--
-- Test — fasce dalle colonne di oggi e ponte (20261014090000)
--
-- Verifica:
--   1. il riempimento: ogni regola ha le fasce che la regola di traduzione
--      dice (una sola, o nessuna), schedule_slot_targets vuota.
--   2. «Fascia» 12:00-15:00 lun e mar → una fascia 720-900 {1,2}.
--   3. modifica a 19:00-23:59 → la fascia diventa 1140-1440, sempre una.
--   4. passaggio a «Sempre» → nessuna fascia; «Sempre» coi giorni → nessuna.
--   5. «Fascia» coi giorni e senza ore → 0-1440 coi giorni; senza giorni → nessuna.
--   6. fine non dopo l'inizio (oggi mai attiva) → fascia {} 0-1440.
--   7. il manager inserisce direttamente una regola senza sedi (lo permette
--      «Roles can insert schedules»): l'inserimento passa e la fascia c'è.
--   8. il manager crea con create_schedule_with_targets e poi cambia l'orario
--      con un UPDATE diretto: la fascia segue.
--   9. con cataloglobe.schedule_bridge = 'from_slots' il ponte non tocca niente.
--  10. regola cancellata → fasce cancellate.
--
-- Prima della migration falliscono tutti tranne 9 e 10.
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero,
-- dopo aver applicato la migration. Attesi 10 `NOTICE … OK`; un `Test N FAIL`
-- interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS fasce_test CASCADE;
CREATE SCHEMA fasce_test;

CREATE OR REPLACE FUNCTION fasce_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

-- Le fasce di una regola in una riga: «giorni start-end; …» o «nessuna».
CREATE OR REPLACE FUNCTION fasce_test.slots_of(p_schedule uuid)
RETURNS text
LANGUAGE sql
AS $$
  SELECT coalesce(
    string_agg(coalesce(s.days_of_week::text, 'ogni giorno') || ' '
               || s.start_minute || '-' || s.end_minute, '; '
               ORDER BY s.sort_order, s.start_minute),
    'nessuna')
  FROM public.schedule_slots s
  WHERE s.schedule_id = p_schedule;
$$;

-- Una regola di prova dell'owner (ruolo postgres): solo i campi che contano.
CREATE OR REPLACE FUNCTION fasce_test.new_rule(
  p_mode text, p_days integer[], p_from time, p_to time)
RETURNS uuid
LANGUAGE sql
AS $$
  INSERT INTO public.schedules
    (tenant_id, rule_type, name, enabled, time_mode, days_of_week, time_from, time_to)
  VALUES ('5b37c952-1add-4196-aab3-9775d98a9c32', 'price', 'Test fasce', false,
          p_mode, p_days, p_from, p_to)
  RETURNING id;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA fasce_test FROM PUBLIC;
GRANT USAGE ON SCHEMA fasce_test TO authenticated;
GRANT EXECUTE ON FUNCTION fasce_test.as_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fasce_test.slots_of(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — riempimento
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.schedules s
  WHERE fasce_test.slots_of(s.id) <> (
    CASE
      WHEN s.time_mode <> 'window' THEN 'nessuna'
      WHEN s.time_from IS NULL OR s.time_to IS NULL THEN
        CASE WHEN s.days_of_week IS NULL THEN 'nessuna'
             ELSE s.days_of_week::text || ' 0-1440' END
      ELSE coalesce(s.days_of_week::text, 'ogni giorno') || ' '
           || (extract(hour FROM s.time_from)::int * 60 + extract(minute FROM s.time_from)::int)
           || '-'
           || CASE WHEN s.time_to >= '23:59' THEN 1440
                   ELSE extract(hour FROM s.time_to)::int * 60 + extract(minute FROM s.time_to)::int END
    END);
  -- Il caso «fine non dopo l'inizio» lo prova il test 6: qui conterebbe come
  -- errore, quindi su staging (dove non c'è) deve risultare zero.
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Test 1 FAIL: % regole con fasce diverse dall''atteso', v_bad;
  END IF;
  IF EXISTS (SELECT 1 FROM public.schedule_slot_targets) THEN
    RAISE EXCEPTION 'Test 1 FAIL: schedule_slot_targets non è vuota';
  END IF;
  RAISE NOTICE 'Test 1 OK: ogni regola ha le fasce attese';
END$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2-6 — traduzione di una regola nuova e delle sue modifiche
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_id uuid;
  v_got text;
BEGIN
  v_id := fasce_test.new_rule('window', '{1,2}', '12:00', '15:00');
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> '{1,2} 720-900' THEN
    RAISE EXCEPTION 'Test 2 FAIL: atteso «{1,2} 720-900», trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 2 OK: fascia con giorni e ore';

  UPDATE public.schedules SET time_from = '19:00', time_to = '23:59' WHERE id = v_id;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> '{1,2} 1140-1440' THEN
    RAISE EXCEPTION 'Test 3 FAIL: atteso «{1,2} 1140-1440», trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 3 OK: la modifica riscrive la fascia, 23:59 = 1440';

  UPDATE public.schedules SET time_mode = 'always' WHERE id = v_id;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> 'nessuna' THEN
    RAISE EXCEPTION 'Test 4 FAIL: «Sempre» coi giorni ha fasce: «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 4 OK: «Sempre» non ha fasce, anche coi giorni';

  UPDATE public.schedules SET time_mode = 'window', time_from = NULL, time_to = NULL WHERE id = v_id;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> '{1,2} 0-1440' THEN
    RAISE EXCEPTION 'Test 5 FAIL: giorni senza ore, atteso «{1,2} 0-1440», trovato «%»', v_got;
  END IF;
  UPDATE public.schedules SET days_of_week = NULL WHERE id = v_id;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> 'nessuna' THEN
    RAISE EXCEPTION 'Test 5 FAIL: senza giorni né ore, trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 5 OK: «Fascia» senza ore';

  UPDATE public.schedules SET time_from = '22:00', time_to = '02:00' WHERE id = v_id;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> '{} 0-1440' THEN
    RAISE EXCEPTION 'Test 6 FAIL: fine prima dell''inizio, atteso «{} 0-1440», trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 6 OK: fine non dopo l''inizio resta mai attiva';
END$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 7 — il manager inserisce direttamente una regola senza sedi
-- -----------------------------------------------------------------------------
SAVEPOINT t7;
DO $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_got text;
BEGIN
  PERFORM fasce_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  INSERT INTO public.schedules
    (id, tenant_id, rule_type, name, enabled, time_mode, time_from, time_to)
  VALUES (v_id, '5b37c952-1add-4196-aab3-9775d98a9c32', 'price', 'Test fasce manager',
          false, 'window', '11:30', '14:00');
  SET LOCAL role postgres;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> 'ogni giorno 690-840' THEN
    RAISE EXCEPTION 'Test 7 FAIL: atteso «ogni giorno 690-840», trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 7 OK: inserimento diretto del manager, fascia scritta';
END$$;
ROLLBACK TO SAVEPOINT t7;

-- -----------------------------------------------------------------------------
-- TEST 8 — il manager crea con la RPC e cambia l'orario con un UPDATE
-- -----------------------------------------------------------------------------
SAVEPOINT t8;
DO $$
DECLARE
  v_id uuid;
  v_got text;
BEGIN
  PERFORM fasce_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_id := public.create_schedule_with_targets(
    '5b37c952-1add-4196-aab3-9775d98a9c32', 'price', 'Test fasce RPC',
    '[{"target_type":"activity","target_id":"347aae51-8df1-4a15-b7f6-40862bf94005"}]'::jsonb);
  UPDATE public.schedules
     SET time_mode = 'window', days_of_week = '{5,6}', time_from = '18:00', time_to = '23:00'
   WHERE id = v_id;
  IF NOT FOUND THEN
    SET LOCAL role postgres;
    RAISE EXCEPTION 'Test 8 FAIL: il manager non aggiorna la sua regola';
  END IF;
  SET LOCAL role postgres;
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> '{5,6} 1080-1380' THEN
    RAISE EXCEPTION 'Test 8 FAIL: atteso «{5,6} 1080-1380», trovato «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 8 OK: RPC più UPDATE del manager, la fascia segue';
END$$;
ROLLBACK TO SAVEPOINT t8;

-- -----------------------------------------------------------------------------
-- TEST 9 — scrittura che arriva dal ponte girato: il trigger la lascia passare
-- -----------------------------------------------------------------------------
SAVEPOINT t9;
DO $$
DECLARE
  v_id uuid;
  v_got text;
BEGIN
  v_id := fasce_test.new_rule('window', NULL, '12:00', '15:00');
  PERFORM set_config('cataloglobe.schedule_bridge', 'from_slots', true);
  UPDATE public.schedules SET time_from = '08:00' WHERE id = v_id;
  PERFORM set_config('cataloglobe.schedule_bridge', '', true);
  v_got := fasce_test.slots_of(v_id);
  IF v_got <> 'ogni giorno 720-900' THEN
    RAISE EXCEPTION 'Test 9 FAIL: col ponte girato la fascia è cambiata: «%»', v_got;
  END IF;
  RAISE NOTICE 'Test 9 OK: from_slots non rientra nel ponte';
END$$;
ROLLBACK TO SAVEPOINT t9;

-- -----------------------------------------------------------------------------
-- TEST 10 — regola cancellata, fasce cancellate
-- -----------------------------------------------------------------------------
SAVEPOINT t10;
DO $$
DECLARE
  v_id uuid;
BEGIN
  v_id := fasce_test.new_rule('window', NULL, '12:00', '15:00');
  DELETE FROM public.schedules WHERE id = v_id;
  IF EXISTS (SELECT 1 FROM public.schedule_slots WHERE schedule_id = v_id) THEN
    RAISE EXCEPTION 'Test 10 FAIL: fasce rimaste dopo la cancellazione';
  END IF;
  RAISE NOTICE 'Test 10 OK: le fasce se ne vanno con la regola';
END$$;
ROLLBACK TO SAVEPOINT t10;

DROP SCHEMA fasce_test CASCADE;
ROLLBACK;
