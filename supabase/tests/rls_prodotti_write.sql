-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- =============================================================================
--
-- Test — scritture di Prodotti: products.write / attributes.write
-- (PR di sicurezza 1/5, migration 20261002160000–20261002160600)
--
-- Verifica, per owner, admin, manager, staff e viewer della stessa azienda:
--   0. forma delle policy: sulle 11 tabelle restano solo le tre policy base di
--      scrittura, tutte con has_permission_any_activity; sulle 4 tabelle
--      variant nessuna policy di scrittura per authenticated
--   1. le 10 tabelle a products.write e product_attribute_definitions ad
--      attributes.write: INSERT, UPDATE e DELETE riescono a owner e admin;
--      manager, staff e viewer ricevono 42501 (INSERT) o 0 righe (UPDATE,
--      DELETE). Nessuno dei tre ha products.write né attributes.write in
--      role_permissions (docs/permissions-matrix.md: solo owner e admin)
--   2. le 4 tabelle variant: nessun ruolo scrive, nemmeno l'owner
--   3. le 4 RPC replace_product_*: owner e admin ok; manager, staff e viewer
--      42501 «Forbidden: missing products.write»
--
-- Ogni caso stampa `PASS`, `FAIL`, `SKIP` (nessuna riga di esempio
-- nell'azienda) o `INCONCLUSO` (errore diverso da quello atteso, col
-- SQLSTATE: va letto). Il file non si interrompe su un FAIL.
--
-- Pattern: si parte dal ruolo postgres (Studio). Ogni gesto gira come
-- authenticated con request.jwt.claims dell'utente, dentro un blocco
-- BEGIN … EXCEPTION che si annulla da solo (errore sentinella P0099): niente
-- resta scritto nemmeno a metà file. Tutto il file è in BEGIN … ROLLBACK.
-- I gesti riusano righe esistenti dell'azienda: UPDATE senza cambiare nulla
-- (tenant_id = tenant_id), DELETE + reinserimento della stessa riga, INSERT
-- della copia della riga (per chi non può scrivere: la RLS rifiuta prima del
-- vincolo di unicità).
--
-- Admin: se `rls_test.admin` è vuoto, il test promuove `rls_test.staff` ad
-- admin dentro il proprio blocco (role = 'admin', tolte le righe di sede),
-- come in translations_write_guard.test.sql; il blocco si annulla.
--
-- Esecuzione: Studio SQL Editor di staging, ruolo postgres, file intero.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Parametri (utenti di test di staging, come negli altri test di supabase/tests)
-- Verifica dei ruoli:
--   SELECT tm.user_id, u.email, tm.role AS ruolo_azienda,
--          tma.role AS ruolo_sede, a.name AS sede
--   FROM public.tenant_memberships tm
--   JOIN auth.users u ON u.id = tm.user_id
--   LEFT JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
--   LEFT JOIN public.activities a ON a.id = tma.activity_id
--   WHERE tm.tenant_id = '<tenant>' AND tm.status = 'active'
--   ORDER BY u.email;
--   SELECT owner_user_id FROM public.tenants WHERE id = '<tenant>';
-- -----------------------------------------------------------------------------
SELECT set_config('rls_test.tenant',  '5b37c952-1add-4196-aab3-9775d98a9c32', true); -- McDonald's
SELECT set_config('rls_test.owner',   '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49', true); -- owner (tenants.owner_user_id)
SELECT set_config('rls_test.admin',   '',                                     true); -- vuoto = staff promosso ad admin
SELECT set_config('rls_test.manager', '16595820-3e80-4ce2-aded-f4c5f01ab92d', true); -- test.manager
SELECT set_config('rls_test.staff',   '9c6580e5-80bc-4fe8-9141-0d299be38f2f', true); -- test.staff
SELECT set_config('rls_test.viewer',  'd01359aa-d980-4030-bc5c-c5e84dfe3d0c', true); -- test.viewer

-- -----------------------------------------------------------------------------
-- Helper (pg_temp: spariscono a fine sessione)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.param(p_key text)
RETURNS uuid
LANGUAGE sql
AS $$ SELECT NULLIF(current_setting('rls_test.' || p_key), '')::uuid $$;

CREATE OR REPLACE FUNCTION pg_temp.as_user(p_user uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  SET LOCAL role authenticated;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.as_postgres()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  SET LOCAL role postgres;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

-- Una riga di esempio dell'azienda (come postgres, salta la RLS).
CREATE OR REPLACE FUNCTION pg_temp.sample_row(p_table text, OUT o_row jsonb, OUT o_ctid tid)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_table = 'product_variant_assignment_values' THEN
    SELECT to_jsonb(v), v.ctid INTO o_row, o_ctid
    FROM public.product_variant_assignment_values v
    JOIN public.product_variant_assignments a ON a.id = v.assignment_id
    WHERE a.tenant_id = pg_temp.param('tenant')
    LIMIT 1;
  ELSE
    EXECUTE format('SELECT to_jsonb(x), x.ctid FROM public.%I x WHERE x.tenant_id = $1 LIMIT 1', p_table)
    INTO o_row, o_ctid
    USING pg_temp.param('tenant');
  END IF;
END;
$$;

-- INSERT, UPDATE e DELETE di `p_label` su `p_table`, con l'esito atteso.
CREATE OR REPLACE FUNCTION pg_temp.check_table(p_table text, p_label text, p_user uuid, p_expect boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_row  jsonb;
  v_ctid tid;
  v_n    int;
  v_tag  text := p_label || ' · ' || p_table;
BEGIN
  PERFORM pg_temp.as_postgres();
  SELECT s.o_row, s.o_ctid INTO v_row, v_ctid FROM pg_temp.sample_row(p_table) s;

  -- INSERT --------------------------------------------------------------------
  IF v_row IS NULL AND p_expect THEN
    RAISE NOTICE 'SKIP %: INSERT/UPDATE/DELETE, nessuna riga di esempio nell''azienda', v_tag;
    RETURN;
  END IF;

  BEGIN
    PERFORM pg_temp.as_user(p_user);
    IF p_expect THEN
      -- La stessa riga tolta e rimessa: niente vincoli violati.
      EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', p_table) USING v_ctid;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN
        RAISE NOTICE 'FAIL %: DELETE ha tolto % righe, attesa 1', v_tag, v_n;
      ELSE
        RAISE NOTICE 'PASS %: DELETE ammessa', v_tag;
      END IF;
      EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).*', p_table, p_table)
      USING v_row;
      RAISE NOTICE 'PASS %: INSERT ammessa', v_tag;
    ELSIF v_row IS NOT NULL THEN
      EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).*', p_table, p_table)
      USING v_row;
      RAISE NOTICE 'FAIL %: INSERT riuscita, attesa 42501', v_tag;
    ELSIF p_table = 'product_variant_assignment_values' THEN
      INSERT INTO public.product_variant_assignment_values (assignment_id, dimension_value_id)
      VALUES (gen_random_uuid(), gen_random_uuid());
      RAISE NOTICE 'FAIL %: INSERT riuscita, attesa 42501', v_tag;
    ELSE
      -- Nessuna riga da copiare: la RLS rifiuta prima dei vincoli NOT NULL.
      EXECUTE format('INSERT INTO public.%I (tenant_id) VALUES ($1)', p_table) USING pg_temp.param('tenant');
      RAISE NOTICE 'FAIL %: INSERT riuscita, attesa 42501', v_tag;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN insufficient_privilege THEN
      IF p_expect THEN
        RAISE NOTICE 'FAIL %: 42501 su INSERT/DELETE, attesa riuscita (%)', v_tag, SQLERRM;
      ELSE
        RAISE NOTICE 'PASS %: INSERT rifiutata (42501)', v_tag;
      END IF;
    WHEN OTHERS THEN
      RAISE NOTICE 'INCONCLUSO %: INSERT/DELETE, SQLSTATE % (%)', v_tag, SQLSTATE, SQLERRM;
  END;

  IF v_row IS NULL THEN
    RAISE NOTICE 'SKIP %: UPDATE/DELETE, nessuna riga di esempio nell''azienda', v_tag;
    RETURN;
  END IF;

  -- UPDATE (senza cambiare nulla) ---------------------------------------------
  BEGIN
    PERFORM pg_temp.as_user(p_user);
    IF p_table = 'product_variant_assignment_values' THEN
      UPDATE public.product_variant_assignment_values SET assignment_id = assignment_id WHERE ctid = v_ctid;
    ELSE
      EXECUTE format('UPDATE public.%I SET tenant_id = tenant_id WHERE ctid = $1', p_table) USING v_ctid;
    END IF;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF (p_expect AND v_n = 1) OR (NOT p_expect AND v_n = 0) THEN
      RAISE NOTICE 'PASS %: UPDATE % righe', v_tag, v_n;
    ELSE
      RAISE NOTICE 'FAIL %: UPDATE % righe, attese %', v_tag, v_n, CASE WHEN p_expect THEN 1 ELSE 0 END;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN insufficient_privilege THEN
      IF p_expect THEN
        RAISE NOTICE 'FAIL %: UPDATE 42501, attesa riuscita (%)', v_tag, SQLERRM;
      ELSE
        RAISE NOTICE 'PASS %: UPDATE rifiutata (42501)', v_tag;
      END IF;
    WHEN OTHERS THEN
      RAISE NOTICE 'INCONCLUSO %: UPDATE, SQLSTATE % (%)', v_tag, SQLSTATE, SQLERRM;
  END;

  -- DELETE di chi non può (per chi può l'ha già provata il blocco INSERT) -----
  IF NOT p_expect THEN
    BEGIN
      PERFORM pg_temp.as_user(p_user);
      EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', p_table) USING v_ctid;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n = 0 THEN
        RAISE NOTICE 'PASS %: DELETE 0 righe', v_tag;
      ELSE
        RAISE NOTICE 'FAIL %: DELETE ha tolto % righe, attese 0', v_tag, v_n;
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS %: DELETE rifiutata (42501)', v_tag;
      WHEN OTHERS THEN
        RAISE NOTICE 'INCONCLUSO %: DELETE, SQLSTATE % (%)', v_tag, SQLSTATE, SQLERRM;
    END;
  END IF;

  PERFORM pg_temp.as_postgres();
END;
$$;

-- Le 4 RPC, chiamate coi valori che il prodotto ha già (un successo non cambia
-- nulla, e comunque si annulla).
CREATE OR REPLACE FUNCTION pg_temp.check_rpcs(p_label text, p_user uuid, p_expect boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant  uuid := pg_temp.param('tenant');
  v_product uuid;
  v_allerg  int[];
  v_ingr    jsonb;
  v_char    uuid[];
  v_pair    jsonb;
  v_rpc     text;
BEGIN
  PERFORM pg_temp.as_postgres();
  SELECT p.id INTO v_product
  FROM public.products p
  WHERE p.tenant_id = v_tenant AND p.parent_product_id IS NULL
  ORDER BY (SELECT count(*) FROM public.product_allergens pa WHERE pa.product_id = p.id) DESC
  LIMIT 1;
  IF v_product IS NULL THEN
    RAISE NOTICE 'SKIP % · RPC: nessun prodotto nell''azienda', p_label;
    RETURN;
  END IF;
  SELECT COALESCE(array_agg(allergen_id::int), '{}') INTO v_allerg
  FROM public.product_allergens WHERE product_id = v_product;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'sort_order', sort_order) ORDER BY sort_order), '[]')
  INTO v_ingr FROM public.product_ingredients WHERE product_id = v_product;
  SELECT COALESCE(array_agg(characteristic_id), '{}') INTO v_char
  FROM public.product_characteristic_assignments WHERE product_id = v_product;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('paired_product_id', paired_product_id, 'note', note, 'sort_order', sort_order) ORDER BY sort_order), '[]')
  INTO v_pair FROM public.product_pairings WHERE product_id = v_product;

  FOREACH v_rpc IN ARRAY ARRAY['replace_product_allergens', 'replace_product_ingredients',
                               'replace_product_characteristics', 'replace_product_pairings']
  LOOP
    BEGIN
      PERFORM pg_temp.as_user(p_user);
      CASE v_rpc
        WHEN 'replace_product_allergens'       THEN PERFORM public.replace_product_allergens(v_tenant, v_product, v_allerg);
        WHEN 'replace_product_ingredients'     THEN PERFORM public.replace_product_ingredients(v_tenant, v_product, v_ingr);
        WHEN 'replace_product_characteristics' THEN PERFORM public.replace_product_characteristics(v_tenant, v_product, v_char);
        WHEN 'replace_product_pairings'        THEN PERFORM public.replace_product_pairings(v_tenant, v_product, v_pair);
      END CASE;
      IF p_expect THEN
        RAISE NOTICE 'PASS % · %: ok', p_label, v_rpc;
      ELSE
        RAISE NOTICE 'FAIL % · %: riuscita, attesa 42501', p_label, v_rpc;
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN insufficient_privilege THEN
        IF p_expect THEN
          RAISE NOTICE 'FAIL % · %: 42501, attesa riuscita (%)', p_label, v_rpc, SQLERRM;
        ELSIF SQLERRM = 'Forbidden: missing products.write' THEN
          RAISE NOTICE 'PASS % · %: 42501 (%)', p_label, v_rpc, SQLERRM;
        ELSE
          RAISE NOTICE 'FAIL % · %: 42501 da un altro controllo (%)', p_label, v_rpc, SQLERRM;
        END IF;
      WHEN OTHERS THEN
        RAISE NOTICE 'INCONCLUSO % · %: SQLSTATE % (%)', p_label, v_rpc, SQLSTATE, SQLERRM;
    END;
  END LOOP;
  PERFORM pg_temp.as_postgres();
END;
$$;

-- Tutti i casi per un utente.
CREATE OR REPLACE FUNCTION pg_temp.check_user(p_label text, p_user uuid, p_writer boolean)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_table text;
BEGIN
  IF p_user IS NULL THEN
    RAISE NOTICE 'SKIP %: utente non impostato', p_label;
    RETURN;
  END IF;
  FOREACH v_table IN ARRAY ARRAY[
    'ingredients', 'product_ingredients', 'product_allergens',
    'product_characteristic_assignments', 'product_pairings', 'product_groups',
    'product_group_items', 'product_option_groups', 'product_option_values',
    'product_attribute_values', 'product_attribute_definitions']
  LOOP
    PERFORM pg_temp.check_table(v_table, p_label, p_user, p_writer);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY[
    'product_variant_dimensions', 'product_variant_dimension_values',
    'product_variant_assignments', 'product_variant_assignment_values']
  LOOP
    PERFORM pg_temp.check_table(v_table, p_label, p_user, false);
  END LOOP;
  PERFORM pg_temp.check_rpcs(p_label, p_user, p_writer);
END;
$$;

-- -----------------------------------------------------------------------------
-- TEST 0 — Forma delle policy di scrittura dopo le migration
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_table text;
  v_perm  text;
  v_bad   text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'ingredients', 'product_ingredients', 'product_allergens',
    'product_characteristic_assignments', 'product_pairings', 'product_groups',
    'product_group_items', 'product_option_groups', 'product_option_values',
    'product_attribute_values', 'product_attribute_definitions']
  LOOP
    v_perm := CASE WHEN v_table = 'product_attribute_definitions' THEN 'attributes.write' ELSE 'products.write' END;
    SELECT string_agg(p.policyname || ' (' || p.cmd || ')', ', ') INTO v_bad
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = v_table
      AND p.permissive = 'PERMISSIVE'
      AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (p.roles && ARRAY['authenticated', 'public']::name[])
      AND NOT (
        p.policyname IN ('Tenant insert own rows', 'Tenant update own rows', 'Tenant delete own rows')
        AND COALESCE(p.qual, p.with_check) LIKE '%has_permission_any_activity(''' || v_perm || '''%'
        AND (p.cmd <> 'UPDATE' OR p.with_check LIKE '%has_permission_any_activity(''' || v_perm || '''%')
      );
    IF v_bad IS NULL THEN
      RAISE NOTICE 'PASS policy · %: solo le tre policy base con %', v_table, v_perm;
    ELSE
      RAISE NOTICE 'FAIL policy · %: %', v_table, v_bad;
    END IF;
  END LOOP;

  FOREACH v_table IN ARRAY ARRAY[
    'product_variant_dimensions', 'product_variant_dimension_values',
    'product_variant_assignments', 'product_variant_assignment_values']
  LOOP
    SELECT string_agg(p.policyname || ' (' || p.cmd || ')', ', ') INTO v_bad
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = v_table
      AND p.permissive = 'PERMISSIVE'
      AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (p.roles && ARRAY['authenticated', 'public']::name[]);
    IF v_bad IS NULL THEN
      RAISE NOTICE 'PASS policy · %: nessuna scrittura per authenticated', v_table;
    ELSE
      RAISE NOTICE 'FAIL policy · %: %', v_table, v_bad;
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- TEST 1–3 — owner, manager, staff, viewer
-- -----------------------------------------------------------------------------
SELECT pg_temp.check_user('owner',   pg_temp.param('owner'),   true);
SELECT pg_temp.check_user('manager', pg_temp.param('manager'), false);
SELECT pg_temp.check_user('staff',   pg_temp.param('staff'),   false);
SELECT pg_temp.check_user('viewer',  pg_temp.param('viewer'),  false);

-- -----------------------------------------------------------------------------
-- TEST 1–3 — admin (utente dato, o staff promosso dentro un blocco annullato)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_admin uuid := COALESCE(pg_temp.param('admin'), pg_temp.param('staff'));
BEGIN
  BEGIN
    IF pg_temp.param('admin') IS NULL THEN
      DELETE FROM public.tenant_membership_activities tma
      USING public.tenant_memberships tm
      WHERE tma.tenant_membership_id = tm.id
        AND tm.tenant_id = pg_temp.param('tenant')
        AND tm.user_id = v_admin;
      UPDATE public.tenant_memberships SET role = 'admin'
      WHERE tenant_id = pg_temp.param('tenant') AND user_id = v_admin;
      RAISE NOTICE 'Nota: staff promosso ad admin per questo blocco';
    END IF;
    PERFORM pg_temp.check_user('admin', v_admin, true);
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
  END;
END $$;

ROLLBACK;
