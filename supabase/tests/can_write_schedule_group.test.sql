-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- Usa l'azienda di test McDonald's e test.manager di staging (UUID sotto).
-- Ogni test gira fra SAVEPOINT e ROLLBACK TO SAVEPOINT, il file chiude con
-- ROLLBACK: nessuna riga reale resta modificata.
-- =============================================================================
--
-- Test — can_write_schedule su una regola assegnata a un gruppo di sedi (D13)
--
-- Verifica (mig 20261010120000):
--   1. gruppo con una sede del manager e una no → il manager NON scrive
--      (prima sì: bastava una sede);
--   2. gruppo con sole sedi del manager → scrive (invariato);
--   3. gruppo vuoto → non scrive (invariato);
--   4. owner → scrive anche sul gruppo misto (invariato).
--   5. le tabelle figlie seguono: il manager non tocca il layout della regola
--      sul gruppo misto (0 righe).
--   6. una sede dove si è solo viewer non conta: chi è manager di una sede e
--      viewer di un'altra non scrive una regola sulla seconda (prima sì).
--      Cerca da solo un utente così su staging; se non c'è, lo dice e salta.
--
-- Prima della migration falliscono 1 e 6, e 5 se il manager vede la regola.
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero.
-- Attesi 6 `NOTICE … OK` (o 5 più «Test 6 SALTATO»); un `Test N FAIL` interrompe il file.
--
-- UUID di riferimento:
--   tenant McDonald's        5b37c952-1add-4196-aab3-9775d98a9c32
--   sede Comasina            347aae51-8df1-4a15-b7f6-40862bf94005
--   sede Baranzate           e1bdd834-4c3c-4441-8cd9-686ecefe48ae
--   owner Lorenzo            9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   test.manager             16595820-3e80-4ce2-aded-f4c5f01ab92d   (manager Comasina + Baranzate)
--   regola «Test - Baranzate»               7a993c30-2c70-43f2-99b8-cd13d24814b1 (con layout)
-- La sede «altrui» è una qualunque sede di McDonald's diversa dalle due.
-- =============================================================================

BEGIN;

DROP SCHEMA IF EXISTS can_write_group_test CASCADE;
CREATE SCHEMA can_write_group_test;

CREATE OR REPLACE FUNCTION can_write_group_test.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

-- Regola layout spenta, assegnata a un gruppo nuovo con le sedi date.
-- Gira come postgres (chiamata prima di as_user).
CREATE OR REPLACE FUNCTION can_write_group_test.rule_on_group(p_activities uuid[])
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant constant uuid := '5b37c952-1add-4196-aab3-9775d98a9c32';
  v_gid uuid;
  v_sid uuid;
BEGIN
  INSERT INTO public.activity_groups (tenant_id, name)
  VALUES (v_tenant, 'Test D13 ' || gen_random_uuid())
  RETURNING id INTO v_gid;

  INSERT INTO public.activity_group_members (tenant_id, group_id, activity_id)
  SELECT v_tenant, v_gid, a FROM unnest(p_activities) AS a;

  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, enabled, apply_to_all, name)
  VALUES (v_tenant, 'layout', 'always', false, false, 'Test D13')
  RETURNING id INTO v_sid;

  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  VALUES (v_sid, 'activity_group', v_gid);

  RETURN v_sid;
END;
$$;

CREATE OR REPLACE FUNCTION can_write_group_test.other_activity()
RETURNS uuid
LANGUAGE sql
AS $$
  SELECT id FROM public.activities
  WHERE tenant_id = '5b37c952-1add-4196-aab3-9775d98a9c32'
    AND id NOT IN ('347aae51-8df1-4a15-b7f6-40862bf94005',
                   'e1bdd834-4c3c-4441-8cd9-686ecefe48ae')
  ORDER BY id
  LIMIT 1;
$$;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA can_write_group_test FROM PUBLIC;
GRANT USAGE ON SCHEMA can_write_group_test TO authenticated;
GRANT EXECUTE ON FUNCTION can_write_group_test.as_user(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- TEST 1 — gruppo misto (Comasina + sede altrui): il manager non scrive
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
  v_other uuid := can_write_group_test.other_activity();
  v_sid uuid;
  v_ok boolean;
BEGIN
  IF v_other IS NULL THEN
    RAISE EXCEPTION 'Test 1 FAIL: prerequisito — McDonald''s senza una terza sede';
  END IF;
  v_sid := can_write_group_test.rule_on_group(
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid, v_other]);

  PERFORM can_write_group_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_ok := public.can_write_schedule(v_sid);
  SET LOCAL role postgres;
  IF v_ok THEN
    RAISE EXCEPTION 'Test 1 FAIL: il manager scrive una regola su un gruppo con una sede non sua';
  END IF;
  RAISE NOTICE 'Test 1 OK: gruppo misto, il manager non scrive';
END$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- TEST 2 — gruppo con sole sedi del manager: scrive (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
  v_sid uuid;
  v_ok boolean;
BEGIN
  v_sid := can_write_group_test.rule_on_group(
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
          'e1bdd834-4c3c-4441-8cd9-686ecefe48ae'::uuid]);

  PERFORM can_write_group_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_ok := public.can_write_schedule(v_sid);
  SET LOCAL role postgres;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 2 FAIL: il manager non scrive una regola su un gruppo tutto suo';
  END IF;
  RAISE NOTICE 'Test 2 OK: gruppo tutto suo, il manager scrive';
END$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- TEST 3 — gruppo vuoto: il manager non scrive (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
DO $$
DECLARE
  v_sid uuid;
  v_ok boolean;
BEGIN
  v_sid := can_write_group_test.rule_on_group(ARRAY[]::uuid[]);

  PERFORM can_write_group_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  v_ok := public.can_write_schedule(v_sid);
  SET LOCAL role postgres;
  IF v_ok THEN
    RAISE EXCEPTION 'Test 3 FAIL: il manager scrive una regola su un gruppo vuoto';
  END IF;
  RAISE NOTICE 'Test 3 OK: gruppo vuoto, il manager non scrive';
END$$;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- TEST 4 — owner: scrive anche sul gruppo misto (invariato)
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
DO $$
DECLARE
  v_sid uuid;
  v_ok boolean;
BEGIN
  v_sid := can_write_group_test.rule_on_group(
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
          can_write_group_test.other_activity()]);

  PERFORM can_write_group_test.as_user('9603ef2a-9f9d-4ebc-8d05-3b2600e36e49');
  v_ok := public.can_write_schedule(v_sid);
  SET LOCAL role postgres;
  IF NOT v_ok THEN
    RAISE EXCEPTION 'Test 4 FAIL: l''owner non scrive una regola su un gruppo misto';
  END IF;
  RAISE NOTICE 'Test 4 OK: l''owner scrive sul gruppo misto';
END$$;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- TEST 5 — tabelle figlie: il manager non aggiorna il layout della regola
--          sul gruppo misto (0 righe)
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
DO $$
DECLARE
  v_sid uuid;
  v_style uuid;
  v_count integer;
BEGIN
  SELECT style_id INTO v_style FROM public.schedule_layout
  WHERE schedule_id = '7a993c30-2c70-43f2-99b8-cd13d24814b1';
  IF v_style IS NULL THEN
    RAISE EXCEPTION 'Test 5 FAIL: prerequisito — «Test - Baranzate» senza layout';
  END IF;
  v_sid := can_write_group_test.rule_on_group(
    ARRAY['347aae51-8df1-4a15-b7f6-40862bf94005'::uuid,
          can_write_group_test.other_activity()]);
  INSERT INTO public.schedule_layout (schedule_id, style_id, tenant_id)
  VALUES (v_sid, v_style, '5b37c952-1add-4196-aab3-9775d98a9c32');

  PERFORM can_write_group_test.as_user('16595820-3e80-4ce2-aded-f4c5f01ab92d');
  UPDATE public.schedule_layout SET style_id = style_id WHERE schedule_id = v_sid;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  SET LOCAL role postgres;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 5 FAIL: il manager aggiorna il layout della regola sul gruppo misto (% righe)', v_count;
  END IF;
  RAISE NOTICE 'Test 5 OK: le tabelle figlie seguono can_write_schedule';
END$$;
ROLLBACK TO SAVEPOINT t5;


-- -----------------------------------------------------------------------------
-- TEST 6 — sede dove si è solo viewer: non conta per scrivere
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
DECLARE
  v_user uuid;
  v_tenant uuid;
  v_viewer_activity uuid;
  v_sid uuid;
  v_ok boolean;
BEGIN
  SELECT tm.user_id, tm.tenant_id, v.activity_id
    INTO v_user, v_tenant, v_viewer_activity
  FROM public.tenant_memberships tm
  JOIN public.tenant_membership_activities m ON m.tenant_membership_id = tm.id AND m.role = 'manager'
  JOIN public.tenant_membership_activities v ON v.tenant_membership_id = tm.id AND v.role = 'viewer'
                                            AND v.activity_id <> m.activity_id
  WHERE tm.status = 'active' AND tm.role NOT IN ('owner', 'admin')
  LIMIT 1;
  IF v_user IS NULL THEN
    RAISE NOTICE 'Test 6 SALTATO: nessun utente manager di una sede e viewer di un''altra';
    RETURN;
  END IF;

  INSERT INTO public.schedules (tenant_id, rule_type, time_mode, enabled, apply_to_all, name)
  VALUES (v_tenant, 'layout', 'always', false, false, 'Test D13 viewer')
  RETURNING id INTO v_sid;
  INSERT INTO public.schedule_targets (schedule_id, target_type, target_id)
  VALUES (v_sid, 'activity', v_viewer_activity);

  PERFORM can_write_group_test.as_user(v_user);
  v_ok := public.can_write_schedule(v_sid);
  SET LOCAL role postgres;
  IF v_ok THEN
    RAISE EXCEPTION 'Test 6 FAIL: chi è solo viewer della sede scrive una regola su quella sede';
  END IF;
  RAISE NOTICE 'Test 6 OK: una sede da viewer non conta per scrivere';
END$$;
ROLLBACK TO SAVEPOINT t6;

ROLLBACK;
