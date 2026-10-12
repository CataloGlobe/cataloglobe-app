-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa la sede «McDonald's - Garbagnate» dell'azienda di test McDonald's e
-- l'owner di staging (UUID sotto). Tutto il file è una transazione sola, chiusa
-- da ROLLBACK; ogni test gira in un suo sotto-blocco che finisce con
-- un'eccezione di comodo (SQLSTATE ZT001), così Postgres annulla i suoi dati
-- prima del test dopo.
-- =============================================================================
--
-- Test — numeri di capienza e pacing per il back office
-- (migration 20261012100000)
--
-- Verifica:
--   1. picco nella finestra con la prenotazione nuova e fascia del pacing;
--      le cancellate non contano
--   2. in modifica (`p_exclude_reservation_id`) la prenotazione stessa non
--      si conta due volte, né nel picco né nella fascia
--   3. utente senza permesso sulla sede → 42501
--   4. numero di persone non valido → 22023
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), tutto il file in
-- una volta. Studio esegue lo script in una transazione sola: con un ROLLBACK
-- per test il primo cancellava anche le funzioni pg_temp e i test dopo
-- fallivano, per questo i test stanno in un blocco unico. Attesi 4
-- `NOTICE … OK`; un `Test N FAIL` interrompe il file. Gira uguale con psql. Se l'INSERT delle
-- prenotazioni viene rifiutato dal controllo del piano, l'azienda di test non
-- ha le prenotazioni nel piano: usare un'altra sede di Lorenzo.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
    json_build_object('sub', p_user, 'role', 'authenticated')::text);
  SET LOCAL role authenticated;
END;
$$;

-- Sede di prova con capienza 10, durata 120, fascia 15 min, tetto di 6
-- persone per fascia; il 2027-03-10: A 20:00 x4 confermata, B 20:30 x3 in
-- attesa, D 20:00 x5 cancellata. Restituisce la sede; l'id di A va in
-- `pg_temp.res_a`.
CREATE OR REPLACE FUNCTION pg_temp.setup()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_activity uuid;
  v_tenant uuid := '5b37c952-1add-4196-aab3-9775d98a9c32';
  v_a uuid;
BEGIN
  SELECT id INTO v_activity FROM public.activities
   WHERE tenant_id = v_tenant AND name = 'McDonald''s - Garbagnate';
  IF v_activity IS NULL THEN
    RAISE EXCEPTION 'setup FAIL: sede «McDonald''s - Garbagnate» non trovata';
  END IF;

  UPDATE public.activities
     SET reservation_capacity = 10,
         reservation_duration_minutes = 120,
         reservation_pacing_slot_minutes = 15,
         reservation_pacing_max_covers = 6,
         reservation_pacing_max_bookings = NULL
   WHERE id = v_activity;

  DELETE FROM public.reservations
   WHERE activity_id = v_activity
     AND reservation_date BETWEEN '2027-03-09' AND '2027-03-11';

  INSERT INTO public.reservations (
    tenant_id, activity_id, reservation_date, reservation_time, party_size,
    customer_name, customer_email, customer_phone, status, source
  ) VALUES (
    v_tenant, v_activity, '2027-03-10', '20:00', 4,
    'TEST capienza A', 'test@example.com', '+39 333 0000000', 'confirmed', 'manual'
  ) RETURNING id INTO v_a;

  INSERT INTO public.reservations (
    tenant_id, activity_id, reservation_date, reservation_time, party_size,
    customer_name, customer_email, customer_phone, status, source
  ) VALUES
    (v_tenant, v_activity, '2027-03-10', '20:30', 3,
     'TEST capienza B', 'test@example.com', '+39 333 0000001', 'pending', 'manual'),
    (v_tenant, v_activity, '2027-03-10', '20:00', 5,
     'TEST capienza D', 'test@example.com', '+39 333 0000002', 'cancelled', 'manual');

  CREATE TEMP TABLE IF NOT EXISTS res_a (id uuid) ON COMMIT DROP;
  DELETE FROM res_a;
  INSERT INTO res_a VALUES (v_a);
  GRANT SELECT ON res_a TO authenticated;
  RETURN v_activity;
END;
$$;

-- -----------------------------------------------------------------------------
-- I quattro test. Ognuno: setup, controllo, poi RAISE … ZT001 che annulla il
-- sotto-blocco (dati, ruolo e claims tornano come prima). Un FAIL ha un altro
-- SQLSTATE: non viene preso e ferma tutto.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_activity uuid;
  v_a uuid;
  r record;
  v_ok text;
BEGIN
  -- TEST 1 — prenotazione nuova alle 20:10 per 2
  -- Finestra 20:10-22:10: A (4) già dentro, +2 della nuova, +3 di B → picco 9.
  -- Fascia 20:00-20:15: solo A (4 persone, 1 prenotazione); D è cancellata.
  BEGIN
    v_activity := pg_temp.setup();
    PERFORM pg_temp.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
    SELECT * INTO r FROM public.get_reservation_capacity_check(v_activity, '2027-03-10', '20:10', 2);
    IF r.capacity <> 10 OR r.duration_minutes <> 120 OR r.peak_with_candidate <> 9
       OR r.pacing_slot_minutes <> 15 OR r.pacing_max_covers <> 6 OR r.pacing_max_bookings IS NOT NULL
       OR r.pacing_bucket_covers <> 4 OR r.pacing_bucket_bookings <> 1 THEN
      RAISE EXCEPTION 'Test 1 FAIL: %', row_to_json(r);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'ZT001', MESSAGE = 'Test 1 OK: picco 9 su 10, fascia 4 persone e 1 prenotazione';
  EXCEPTION WHEN SQLSTATE 'ZT001' THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE '%', v_ok;
  END;

  -- TEST 2 — A in modifica (stessi dati): A non si conta due volte
  -- Finestra 20:00-22:00: A come candidata (4) + B (3) → picco 7. Fascia vuota.
  BEGIN
    v_activity := pg_temp.setup();
    SELECT id INTO v_a FROM res_a;
    PERFORM pg_temp.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
    SELECT * INTO r FROM public.get_reservation_capacity_check(v_activity, '2027-03-10', '20:00', 4, v_a);
    IF r.peak_with_candidate <> 7 OR r.pacing_bucket_covers <> 0 OR r.pacing_bucket_bookings <> 0 THEN
      RAISE EXCEPTION 'Test 2 FAIL: %', row_to_json(r);
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'ZT001', MESSAGE = 'Test 2 OK: in modifica picco 7, fascia vuota';
  EXCEPTION WHEN SQLSTATE 'ZT001' THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE '%', v_ok;
  END;

  -- TEST 3 — utente senza permesso sulla sede → 42501
  BEGIN
    v_activity := pg_temp.setup();
    PERFORM pg_temp.as_user(gen_random_uuid());
    BEGIN
      PERFORM public.get_reservation_capacity_check(v_activity, '2027-03-10', '20:10', 2);
      RAISE EXCEPTION 'Test 3 FAIL: nessun errore per un utente estraneo';
    EXCEPTION WHEN insufficient_privilege THEN
      NULL;
    END;
    RAISE EXCEPTION USING ERRCODE = 'ZT001', MESSAGE = 'Test 3 OK: utente estraneo → 42501';
  EXCEPTION WHEN SQLSTATE 'ZT001' THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE '%', v_ok;
  END;

  -- TEST 4 — numero di persone non valido → 22023
  BEGIN
    v_activity := pg_temp.setup();
    PERFORM pg_temp.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
    BEGIN
      PERFORM public.get_reservation_capacity_check(v_activity, '2027-03-10', '20:10', 0);
      RAISE EXCEPTION 'Test 4 FAIL: nessun errore con 0 persone';
    EXCEPTION WHEN invalid_parameter_value THEN
      NULL;
    END;
    RAISE EXCEPTION USING ERRCODE = 'ZT001', MESSAGE = 'Test 4 OK: 0 persone → 22023';
  EXCEPTION WHEN SQLSTATE 'ZT001' THEN
    GET STACKED DIAGNOSTICS v_ok = MESSAGE_TEXT;
    RAISE NOTICE '%', v_ok;
  END;
END;
$$;

ROLLBACK;
