-- =============================================================================
-- ⚠️ DIPENDE DAI DATI DI STAGING — NON ESEGUIRE IN PRODUZIONE.
-- =============================================================================
--
-- Test — scritture di Prodotti: products.write / attributes.write
-- (PR di sicurezza 1/5, migration 20261002160000–20261002160700)
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
--   4. import_products_into_catalog: owner e admin ok; manager, staff e viewer
--      42501 (senza catalogs.write si fermano al controllo che viene prima);
--      il viewer con catalogs.write prestato nel blocco riceve
--      «Forbidden: missing products.write»
--
-- Esecuzione: Studio SQL Editor di staging, file intero. È un solo blocco
-- DO: lo Studio mostra solo l'ultima istruzione e non i RAISE NOTICE, quindi
-- gli esiti escono tutti nel messaggio dell'errore finale.
--
-- L'ERRORE FINALE È VOLUTO: il blocco termina sempre con RAISE EXCEPTION
-- «PASS n / FAIL m …» seguito da una riga per caso (prima le FAIL, poi i casi
-- non provati, poi le PASS). L'eccezione annulla ogni scrittura fatta dal
-- test, comprese la promozione ad admin e il permesso prestato al viewer.
-- In più ogni caso gira in un sotto-blocco che si annulla da solo (errore
-- sentinella P0099), quindi nemmeno a metà blocco resta qualcosa scritto.
--
-- Riga di esito: «PASS|FAIL · ruolo · tabella/RPC · operazione · atteso · ottenuto».
-- «NON PROVATO» = nessuna riga di esempio nell'azienda per quel gesto (o
-- nessun prodotto per le RPC): il caso non dimostra nulla, va letto.
--
-- Pattern: si parte dal ruolo postgres. Ogni gesto gira come authenticated
-- (set_config('role') + request.jwt.claims dell'utente); dopo ogni caso
-- RESET ROLE. I gesti riusano righe esistenti dell'azienda: UPDATE senza
-- cambiare nulla (tenant_id = tenant_id), DELETE + reinserimento della stessa
-- riga, INSERT della copia della riga (per chi non può scrivere: la RLS
-- rifiuta prima del vincolo di unicità).
--
-- Admin: se c_admin è NULL, il test promuove c_staff ad admin dentro il
-- blocco di quell'utente (role = 'admin', tolte le righe di sede), come in
-- translations_write_guard.test.sql; il blocco si annulla.
--
-- Verifica dei ruoli (prima di lanciare, se servono altri utenti):
--   SELECT tm.user_id, u.email, tm.role AS ruolo_azienda,
--          tma.role AS ruolo_sede, a.name AS sede
--   FROM public.tenant_memberships tm
--   JOIN auth.users u ON u.id = tm.user_id
--   LEFT JOIN public.tenant_membership_activities tma ON tma.tenant_membership_id = tm.id
--   LEFT JOIN public.activities a ON a.id = tma.activity_id
--   WHERE tm.tenant_id = '<tenant>' AND tm.status = 'active'
--   ORDER BY u.email;
--   SELECT owner_user_id FROM public.tenants WHERE id = '<tenant>';
-- =============================================================================

DO $$
DECLARE
  -- ---------------------------------------------------------------------------
  -- Parametri (utenti di test di staging, come negli altri test di supabase/tests)
  -- ---------------------------------------------------------------------------
  c_tenant  CONSTANT uuid := '5b37c952-1add-4196-aab3-9775d98a9c32'; -- McDonald's
  c_owner   CONSTANT uuid := '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49'; -- owner (tenants.owner_user_id)
  c_admin   CONSTANT uuid := NULL;                                   -- NULL = c_staff promosso ad admin
  c_manager CONSTANT uuid := '16595820-3e80-4ce2-aded-f4c5f01ab92d'; -- test.manager
  c_staff   CONSTANT uuid := '9c6580e5-80bc-4fe8-9141-0d299be38f2f'; -- test.staff
  c_viewer  CONSTANT uuid := 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c'; -- test.viewer

  c_gated CONSTANT text[] := ARRAY[
    'ingredients', 'product_ingredients', 'product_allergens',
    'product_characteristic_assignments', 'product_pairings', 'product_groups',
    'product_group_items', 'product_option_groups', 'product_option_values',
    'product_attribute_values', 'product_attribute_definitions'];
  c_variant CONSTANT text[] := ARRAY[
    'product_variant_dimensions', 'product_variant_dimension_values',
    'product_variant_assignments', 'product_variant_assignment_values'];
  c_rpcs CONSTANT text[] := ARRAY[
    'replace_product_allergens', 'replace_product_ingredients',
    'replace_product_characteristics', 'replace_product_pairings'];
  c_forbidden CONSTANT text := '42501 Forbidden: missing products.write';
  c_import_categories CONSTANT jsonb :=
    '[{"ref": "c1", "existing_id": null, "name": "Test RLS", "name_hash": "test",
       "level": 1, "parent_ref": null, "sort_order": 0}]';
  c_import_products CONSTANT jsonb :=
    '[{"action": "create", "category_ref": "c1", "sort_order": 0,
       "product": {"name": "Test RLS import", "base_price": 1, "product_type": "simple",
                   "format_group_name_hash": "test",
                   "formats": [{"name": "Piccolo", "absolute_price": 1, "name_hash": "test"}]}}]';

  -- Esiti
  v_pass    text[] := '{}';
  v_fail    text[] := '{}';
  v_skipped text[] := '{}';
  v_line    text;

  -- Utenti
  v_labels text[];
  v_users  uuid[];
  v_writer boolean[];
  v_i      int;
  v_label  text;
  v_user   uuid;
  v_claims text;
  v_can    boolean;

  -- Casi
  v_cases  text[] := '{}';
  v_case   text;
  v_table  text;
  v_op     text;
  v_obj    text;
  v_deny   boolean;
  v_exp    text;
  v_got    text;
  v_status text;
  v_row    jsonb;
  v_ctid   tid;
  v_n      int;
  v_perm   text;
  v_bad    text;
  v_result jsonb;

  -- Prodotto di esempio per le RPC
  v_product uuid;
  v_allerg  int[];
  v_ingr    jsonb;
  v_char    uuid[];
  v_pair    jsonb;
BEGIN
  -- ---------------------------------------------------------------------------
  -- Parametri obbligatori
  -- ---------------------------------------------------------------------------
  IF c_tenant  IS NULL THEN RAISE EXCEPTION 'Parametro mancante: c_tenant';  END IF;
  IF c_owner   IS NULL THEN RAISE EXCEPTION 'Parametro mancante: c_owner';   END IF;
  IF c_manager IS NULL THEN RAISE EXCEPTION 'Parametro mancante: c_manager'; END IF;
  IF c_staff   IS NULL THEN RAISE EXCEPTION 'Parametro mancante: c_staff';   END IF;
  IF c_viewer  IS NULL THEN RAISE EXCEPTION 'Parametro mancante: c_viewer';  END IF;

  -- ---------------------------------------------------------------------------
  -- TEST 0 — Forma delle policy di scrittura dopo le migration
  -- ---------------------------------------------------------------------------
  FOREACH v_table IN ARRAY c_gated LOOP
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
    v_line := format('%s · schema · %s · policy · atteso: solo le tre policy base con %s · ottenuto: %s',
                     CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, v_table, v_perm,
                     COALESCE(v_bad, 'ok'));
    IF v_bad IS NULL THEN v_pass := v_pass || v_line; ELSE v_fail := v_fail || v_line; END IF;
  END LOOP;

  FOREACH v_table IN ARRAY c_variant LOOP
    SELECT string_agg(p.policyname || ' (' || p.cmd || ')', ', ') INTO v_bad
    FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = v_table
      AND p.permissive = 'PERMISSIVE'
      AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      AND (p.roles && ARRAY['authenticated', 'public']::name[]);
    v_line := format('%s · schema · %s · policy · atteso: nessuna scrittura per authenticated · ottenuto: %s',
                     CASE WHEN v_bad IS NULL THEN 'PASS' ELSE 'FAIL' END, v_table,
                     COALESCE(v_bad, 'ok'));
    IF v_bad IS NULL THEN v_pass := v_pass || v_line; ELSE v_fail := v_fail || v_line; END IF;
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- Prodotto di esempio per le RPC: chiamate coi valori che ha già (un
  -- successo non cambia nulla, e comunque si annulla).
  -- ---------------------------------------------------------------------------
  SELECT p.id INTO v_product
  FROM public.products p
  WHERE p.tenant_id = c_tenant AND p.parent_product_id IS NULL
  ORDER BY (SELECT count(*) FROM public.product_allergens pa WHERE pa.product_id = p.id) DESC
  LIMIT 1;
  SELECT COALESCE(array_agg(allergen_id::int), '{}') INTO v_allerg
  FROM public.product_allergens WHERE product_id = v_product;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('ingredient_id', ingredient_id, 'sort_order', sort_order) ORDER BY sort_order), '[]')
  INTO v_ingr FROM public.product_ingredients WHERE product_id = v_product;
  SELECT COALESCE(array_agg(characteristic_id), '{}') INTO v_char
  FROM public.product_characteristic_assignments WHERE product_id = v_product;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('paired_product_id', paired_product_id, 'note', note, 'sort_order', sort_order) ORDER BY sort_order), '[]')
  INTO v_pair FROM public.product_pairings WHERE product_id = v_product;

  -- ---------------------------------------------------------------------------
  -- Casi per utente: «oggetto:operazione»
  -- ---------------------------------------------------------------------------
  FOREACH v_table IN ARRAY c_gated || c_variant LOOP
    FOREACH v_op IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE'] LOOP
      v_cases := v_cases || (v_table || ':' || v_op);
    END LOOP;
  END LOOP;
  FOREACH v_obj IN ARRAY c_rpcs LOOP
    v_cases := v_cases || (v_obj || ':chiamata');
  END LOOP;
  v_cases := v_cases || 'import_products_into_catalog:chiamata'::text;

  v_labels := ARRAY['owner', 'manager', 'staff', 'viewer', 'admin'];
  v_users  := ARRAY[c_owner, c_manager, c_staff, c_viewer, COALESCE(c_admin, c_staff)];
  v_writer := ARRAY[true, false, false, false, true];

  -- ---------------------------------------------------------------------------
  -- TEST 1–4 — un sotto-blocco per utente (l'admin promosso vive solo lì)
  -- ---------------------------------------------------------------------------
  FOR v_i IN 1 .. array_length(v_labels, 1) LOOP
    v_label  := v_labels[v_i];
    v_user   := v_users[v_i];
    v_can    := v_writer[v_i];
    v_claims := format('{"sub":"%s","role":"authenticated"}', v_user);

    BEGIN
      IF v_label = 'admin' AND c_admin IS NULL THEN
        DELETE FROM public.tenant_membership_activities tma
        USING public.tenant_memberships tm
        WHERE tma.tenant_membership_id = tm.id
          AND tm.tenant_id = c_tenant
          AND tm.user_id = v_user;
        UPDATE public.tenant_memberships SET role = 'admin'
        WHERE tenant_id = c_tenant AND user_id = v_user;
        v_label := 'admin (staff promosso)';
      END IF;

      FOREACH v_case IN ARRAY v_cases LOOP
        v_obj    := split_part(v_case, ':', 1);
        v_op     := split_part(v_case, ':', 2);
        v_status := NULL;
        v_got    := NULL;
        v_row    := NULL;
        v_ctid   := NULL;

        -- Atteso e riga di esempio, come postgres (salta la RLS).
        IF v_obj = ANY (c_gated || c_variant) THEN
          v_deny := NOT v_can OR v_obj = ANY (c_variant);
          IF v_obj = 'product_variant_assignment_values' THEN
            SELECT to_jsonb(v), v.ctid INTO v_row, v_ctid
            FROM public.product_variant_assignment_values v
            JOIN public.product_variant_assignments a ON a.id = v.assignment_id
            WHERE a.tenant_id = c_tenant
            LIMIT 1;
          ELSE
            EXECUTE format('SELECT to_jsonb(x), x.ctid FROM public.%I x WHERE x.tenant_id = $1 LIMIT 1', v_obj)
            INTO v_row, v_ctid
            USING c_tenant;
          END IF;
          v_exp := CASE
            WHEN v_deny AND v_op = 'INSERT' THEN '42501'
            WHEN v_deny                     THEN '0 righe o 42501'
            WHEN v_op = 'INSERT'            THEN 'ok'
            ELSE '1 riga' END;
          -- Senza riga: chi scrive non ha niente da togliere e rimettere; chi
          -- non scrive prova comunque l'INSERT, ma UPDATE e DELETE non provano nulla.
          IF v_row IS NULL AND (NOT v_deny OR v_op <> 'INSERT') THEN
            v_status := 'NON PROVATO';
            v_got    := 'nessuna riga di esempio nell''azienda';
          END IF;
        ELSIF v_obj = ANY (c_rpcs) THEN
          v_exp := CASE WHEN v_can THEN 'ok' ELSE c_forbidden END;
          IF v_product IS NULL THEN
            v_status := 'NON PROVATO';
            v_got    := 'nessun prodotto nell''azienda';
          END IF;
        ELSE
          -- import: chi non ha catalogs.write si ferma al controllo che viene
          -- prima, quindi qui basta un 42501 qualsiasi (il controllo nuovo da
          -- solo lo prova il TEST 4).
          v_exp := CASE WHEN v_can THEN 'ok (1 prodotto creato)' ELSE '42501' END;
        END IF;

        IF v_status IS NULL THEN
          BEGIN
            PERFORM set_config('role', 'authenticated', true);
            PERFORM set_config('request.jwt.claims', v_claims, true);

            IF v_obj = ANY (c_gated || c_variant) THEN
              IF v_op = 'INSERT' THEN
                IF NOT v_deny THEN
                  -- La stessa riga tolta e rimessa: niente vincoli violati.
                  EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', v_obj) USING v_ctid;
                  EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).*', v_obj, v_obj)
                  USING v_row;
                  v_got := 'ok';
                ELSIF v_row IS NOT NULL THEN
                  EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).*', v_obj, v_obj)
                  USING v_row;
                  v_got := 'riuscita';
                ELSIF v_obj = 'product_variant_assignment_values' THEN
                  INSERT INTO public.product_variant_assignment_values (assignment_id, dimension_value_id)
                  VALUES (gen_random_uuid(), gen_random_uuid());
                  v_got := 'riuscita';
                ELSE
                  -- Nessuna riga da copiare: la RLS rifiuta prima dei vincoli NOT NULL.
                  EXECUTE format('INSERT INTO public.%I (tenant_id) VALUES ($1)', v_obj) USING c_tenant;
                  v_got := 'riuscita';
                END IF;
              ELSIF v_op = 'UPDATE' THEN
                -- Senza cambiare nulla.
                IF v_obj = 'product_variant_assignment_values' THEN
                  UPDATE public.product_variant_assignment_values SET assignment_id = assignment_id WHERE ctid = v_ctid;
                ELSE
                  EXECUTE format('UPDATE public.%I SET tenant_id = tenant_id WHERE ctid = $1', v_obj) USING v_ctid;
                END IF;
                GET DIAGNOSTICS v_n = ROW_COUNT;
                v_got := v_n || CASE WHEN v_n = 1 THEN ' riga' ELSE ' righe' END;
              ELSE
                EXECUTE format('DELETE FROM public.%I WHERE ctid = $1', v_obj) USING v_ctid;
                GET DIAGNOSTICS v_n = ROW_COUNT;
                v_got := v_n || CASE WHEN v_n = 1 THEN ' riga' ELSE ' righe' END;
              END IF;

            ELSIF v_obj = ANY (c_rpcs) THEN
              CASE v_obj
                WHEN 'replace_product_allergens'       THEN PERFORM public.replace_product_allergens(c_tenant, v_product, v_allerg);
                WHEN 'replace_product_ingredients'     THEN PERFORM public.replace_product_ingredients(c_tenant, v_product, v_ingr);
                WHEN 'replace_product_characteristics' THEN PERFORM public.replace_product_characteristics(c_tenant, v_product, v_char);
                WHEN 'replace_product_pairings'        THEN PERFORM public.replace_product_pairings(c_tenant, v_product, v_pair);
              END CASE;
              v_got := 'ok';

            ELSE
              v_result := public.import_products_into_catalog(
                c_tenant, NULL, 'Test RLS import', c_import_categories, c_import_products);
              v_got := CASE WHEN (v_result->>'created_products')::int = 1
                            THEN 'ok (1 prodotto creato)'
                            ELSE 'esito inatteso ' || v_result::text END;
            END IF;

            RAISE EXCEPTION USING ERRCODE = 'P0099';
          EXCEPTION
            WHEN SQLSTATE 'P0099' THEN NULL;
            WHEN OTHERS THEN v_got := SQLSTATE || ' ' || SQLERRM;
          END;
          EXECUTE 'RESET ROLE';
          PERFORM set_config('request.jwt.claims', '', true);

          v_status := CASE
            WHEN v_got = v_exp THEN 'PASS'
            WHEN v_exp = '42501' AND v_got LIKE '42501 %' THEN 'PASS'
            WHEN v_exp = '0 righe o 42501' AND (v_got = '0 righe' OR v_got LIKE '42501 %') THEN 'PASS'
            ELSE 'FAIL' END;
        END IF;

        v_line := format('%s · %s · %s · %s · atteso: %s · ottenuto: %s',
                         v_status, v_label, v_obj, v_op, v_exp, v_got);
        IF v_status = 'PASS' THEN
          v_pass := v_pass || v_line;
        ELSIF v_status = 'FAIL' THEN
          v_fail := v_fail || v_line;
        ELSE
          v_skipped := v_skipped || v_line;
        END IF;
      END LOOP;

      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN OTHERS THEN
        v_fail := v_fail || format('FAIL · %s · - · blocco utente · atteso: nessun errore · ottenuto: %s %s',
                                   v_label, SQLSTATE, SQLERRM);
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
  END LOOP;

  -- ---------------------------------------------------------------------------
  -- TEST 4 — import_products_into_catalog, controllo products.write da solo.
  -- Il viewer si ferma già a catalogs.write. Qui il ruolo viewer riceve
  -- catalogs.write in role_permissions dentro un blocco annullato, così
  -- l'import arriva al controllo nuovo e deve fermarsi lì.
  -- ---------------------------------------------------------------------------
  v_got := NULL;
  BEGIN
    INSERT INTO public.role_permissions (role, permission_id)
    VALUES ('viewer', 'catalogs.write')
    ON CONFLICT DO NOTHING;
    BEGIN
      PERFORM set_config('role', 'authenticated', true);
      PERFORM set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', c_viewer), true);
      v_result := public.import_products_into_catalog(
        c_tenant, NULL, 'Test RLS import', c_import_categories, c_import_products);
      v_got := 'riuscita ' || v_result::text;
      RAISE EXCEPTION USING ERRCODE = 'P0099';
    EXCEPTION
      WHEN SQLSTATE 'P0099' THEN NULL;
      WHEN OTHERS THEN v_got := SQLSTATE || ' ' || SQLERRM;
    END;
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '', true);
    RAISE EXCEPTION USING ERRCODE = 'P0099';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN OTHERS THEN v_got := COALESCE(v_got, SQLSTATE || ' ' || SQLERRM);
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
  v_line := format('%s · viewer+catalogs.write · import_products_into_catalog · chiamata · atteso: %s · ottenuto: %s',
                   CASE WHEN v_got = c_forbidden THEN 'PASS' ELSE 'FAIL' END, c_forbidden, v_got);
  IF v_got = c_forbidden THEN v_pass := v_pass || v_line; ELSE v_fail := v_fail || v_line; END IF;

  -- ---------------------------------------------------------------------------
  -- Riepilogo: l'eccezione mostra gli esiti nello Studio e annulla tutto.
  -- ---------------------------------------------------------------------------
  RAISE EXCEPTION '%', concat_ws(E'\n',
    format('PASS %s / FAIL %s', cardinality(v_pass), cardinality(v_fail))
      || CASE WHEN cardinality(v_skipped) > 0
              THEN format(' (non provati %s)', cardinality(v_skipped)) ELSE '' END,
    NULLIF(array_to_string(v_fail, E'\n'), ''),
    NULLIF(array_to_string(v_skipped, E'\n'), ''),
    NULLIF(array_to_string(v_pass, E'\n'), ''));
END $$;
