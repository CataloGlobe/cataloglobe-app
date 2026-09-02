-- =============================================================================
-- CataloGlobe V2 — Test rubrica clienti (reservation_guests + view derivate)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── COSA VERIFICA ───────────────────────────────────────────────────────────
--   1  il trigger crea il profilo e lo aggancia alla prenotazione
--   2  ultimo nome visto in prenotazione = display_name del profilo
--   3  stesso e164 scritto in due modi diversi → un solo profilo
--   4  prenotazione senza email non azzera l'email del profilo
--   5  e164 NULL → nessun profilo, nessun aggancio
--   6  security_invoker=on su tutte e tre le view
--   7  LEAK: il manager non vede le visite delle sedi che non ha  ← il test che conta
--   8  il manager vede esattamente le visite delle sue sedi
--   9  gli aggregati ereditano lo stesso filtro (no-show di un'altra sede escluso)
--  10  l'elenco rubrica conta solo le visite visibili
--  11  lo stesso profilo, letto dall'owner, mostra tutto
--  12  staff: nessun accesso alla rubrica
--  13  viewer: nessun accesso alla rubrica
--  14  manager con guests.manage: scrive note e tag
--  15  creazione manuale di un profilo: bloccata dalle RLS
--
-- Il caso 7 e' il motivo per cui questo file esiste: profilo tenant-wide,
-- prenotazioni activity-scoped. Se le view perdessero `security_invoker`, un
-- manager leggerebbe le visite di sedi su cui non ha alcun permesso, e la cosa
-- resterebbe invisibile finche' non esiste un tenant multi-sede con manager
-- diversi — cioe' fino al primo cliente vero.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
-- Da eseguire DOPO 20260902120000..120003.
--
-- NON e' eseguibile via MCP: quella connessione e' read-only e questo script
-- scrive (poi annulla tutto). Serve una sessione normale.
--
-- Prerequisito: `seed_permissions_test_data.sql` gia' eseguito. Il caso 0
-- lo verifica e dice cosa manca invece di far fallire i test a valle per il
-- motivo sbagliato.
--
-- ── OUTPUT ──────────────────────────────────────────────────────────────────
-- Una tabella (ordine, caso, atteso, ottenuto, verdetto) piu' una riga di
-- riepilogo. Nessun RAISE NOTICE: Studio non li mostra.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive. Le
-- prenotazioni di prova stanno nel 2099, fuori da qualunque dato reale.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- UUID di riferimento (vedi seed_permissions_test_data.sql):
--   tenant McDonald's     5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo         9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   Comasina              347aae51-8df1-4a15-b7f6-40862bf94005  (manager SI)
--   Baranzate             e1bdd834-4c3c-4441-8cd9-686ecefe48ae  (manager SI)
--   Garbagnate            1f62cac4-2ba9-436b-b075-057203658422  (manager NO)
--   test.manager          16595820-3e80-4ce2-aded-f4c5f01ab92d
--   test.staff            9c6580e5-80bc-4fe8-9141-0d299be38f2f
--   test.viewer           d01359aa-d980-4030-bc5c-c5e84dfe3d0c
-- =============================================================================

BEGIN;

CREATE TEMP TABLE _esiti (
    ordine   int,
    caso     text,
    atteso   text,
    ottenuto text,
    verdetto text
);

DO $$
DECLARE
    c_tenant     CONSTANT uuid := '5b37c952-1add-4196-aab3-9775d98a9c32';
    c_comasina   CONSTANT uuid := '347aae51-8df1-4a15-b7f6-40862bf94005';
    c_baranzate  CONSTANT uuid := 'e1bdd834-4c3c-4441-8cd9-686ecefe48ae';
    c_garbagnate CONSTANT uuid := '1f62cac4-2ba9-436b-b075-057203658422';

    c_owner      CONSTANT text := '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49';
    c_manager    CONSTANT text := '16595820-3e80-4ce2-aded-f4c5f01ab92d';
    c_staff      CONSTANT text := '9c6580e5-80bc-4fe8-9141-0d299be38f2f';
    c_viewer     CONSTANT text := 'd01359aa-d980-4030-bc5c-c5e84dfe3d0c';

    c_date       CONSTANT date := DATE '2099-04-20';
    c_phone_a    CONSTANT text := '+393451559558';   -- Mario  (Comasina + Baranzate)
    c_phone_b    CONSTANT text := '+393339876543';   -- Giulia (Comasina + Garbagnate)

    v_guest_a    uuid;
    v_guest_b    uuid;
    v_res_id     uuid;
    v_got        text;
    v_count      bigint;
    v_visits     bigint;
    v_no_shows   bigint;
    v_ordine     int := 0;

-- Impersonazione: SET LOCAL ROLE + claims per misurare, RESET ROLE prima di
-- scrivere in _esiti (temp table del ruolo di sessione, non scrivibile da
-- `authenticated`).
BEGIN
    -- ═══ 0 — preflight sul seed ════════════════════════════════════════════
    v_ordine := v_ordine + 1;

    SELECT COALESCE(
        'manager:' || COUNT(*) FILTER (WHERE tm.user_id = c_manager::uuid) ||
        '/staff:'  || COUNT(*) FILTER (WHERE tm.user_id = c_staff::uuid)   ||
        '/viewer:' || COUNT(*) FILTER (WHERE tm.user_id = c_viewer::uuid), '')
      INTO v_got
    FROM public.tenant_memberships tm
    JOIN public.tenant_membership_activities tma
      ON tma.tenant_membership_id = tm.id
    WHERE tm.tenant_id = c_tenant
      AND tm.status = 'active';

    INSERT INTO _esiti VALUES (
        v_ordine,
        '0 — seed permessi presente (sedi assegnate per utente di test)',
        'manager:2/staff:1/viewer:1',
        v_got,
        CASE WHEN v_got = 'manager:2/staff:1/viewer:1' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ setup dati (come ruolo di sessione: RLS non si applica) ═══════════
    -- Mario: due prenotazioni, telefono grezzo scritto in due modi diversi ma
    -- stesso e164. E' il caso che la rubrica esiste per riconoscere.
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES (
        c_tenant, c_comasina, c_date, TIME '20:00', 2,
        'Mario Rossi', 'mario@example.invalid', '345 155-9558', c_phone_a,
        'confirmed', 'manual'
    )
    RETURNING id, guest_id INTO v_res_id, v_guest_a;

    -- ═══ 1 — il trigger aggancia ═══════════════════════════════════════════
    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '1 — trigger: guest_id agganciato sulla prenotazione',
        'agganciato',
        CASE WHEN v_guest_a IS NULL THEN 'guest_id NULL' ELSE 'agganciato' END,
        CASE WHEN v_guest_a IS NULL THEN 'FALLITO' ELSE 'OK' END
    );

    -- ═══ 2 — display_name ══════════════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT display_name INTO v_got
    FROM public.reservation_guests WHERE id = v_guest_a;

    INSERT INTO _esiti VALUES (
        v_ordine,
        '2 — display_name preso dalla prenotazione',
        'Mario Rossi',
        COALESCE(v_got, '(nessun profilo)'),
        CASE WHEN v_got = 'Mario Rossi' THEN 'OK' ELSE 'FALLITO' END
    );

    -- Seconda prenotazione di Mario: altra sede, telefono scritto diversamente,
    -- email vuota.
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES (
        c_tenant, c_baranzate, c_date, TIME '21:00', 4,
        'Mario Rossi', '', '+39 345 1559558', c_phone_a,
        'confirmed', 'online'
    );

    -- ═══ 3 — deduplica ═════════════════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT COUNT(*) INTO v_count
    FROM public.reservation_guests
    WHERE tenant_id = c_tenant AND phone_e164 = c_phone_a;

    INSERT INTO _esiti VALUES (
        v_ordine,
        '3 — due prenotazioni stesso e164 → un solo profilo',
        '1 profilo',
        v_count || ' profilo/i',
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 4 — l'email non si azzera ═════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT email INTO v_got FROM public.reservation_guests WHERE id = v_guest_a;

    INSERT INTO _esiti VALUES (
        v_ordine,
        '4 — prenotazione senza email non cancella il contatto noto',
        'mario@example.invalid',
        COALESCE(v_got, '(NULL)'),
        CASE WHEN v_got = 'mario@example.invalid' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 5 — e164 NULL → nessun profilo ════════════════════════════════════
    v_ordine := v_ordine + 1;
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES (
        c_tenant, c_comasina, c_date, TIME '22:00', 2,
        'Anonimo', 'anonimo@example.invalid', 'chiedere in cassa', NULL,
        'pending', 'manual'
    )
    RETURNING guest_id INTO v_res_id;

    INSERT INTO _esiti VALUES (
        v_ordine,
        '5 — telefono non canonicalizzabile → nessun profilo',
        'nessun profilo',
        CASE WHEN v_res_id IS NULL THEN 'nessun profilo' ELSE 'profilo creato' END,
        CASE WHEN v_res_id IS NULL THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 6 — security_invoker sulle view ═══════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT COUNT(*) INTO v_count
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('v_reservation_guest_visits',
                        'v_reservation_guest_stats',
                        'v_reservation_guests_directory')
      AND c.reloptions @> ARRAY['security_invoker=on'];

    INSERT INTO _esiti VALUES (
        v_ordine,
        '6 — security_invoker=on su tutte e tre le view',
        '3 view',
        v_count || ' view',
        CASE WHEN v_count = 3 THEN 'OK' ELSE 'FALLITO' END
    );

    -- Giulia: una visita a Comasina (il manager ce l'ha) e un no-show a
    -- Garbagnate (non ce l'ha). E' la coppia che smaschera il leak.
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES
        (c_tenant, c_comasina,   c_date, TIME '20:00', 2,
         'Giulia Bianchi', 'giulia@example.invalid', '3339876543', c_phone_b,
         'confirmed', 'manual'),
        (c_tenant, c_garbagnate, c_date, TIME '21:30', 6,
         'Giulia Bianchi', 'giulia@example.invalid', '3339876543', c_phone_b,
         'no_show', 'manual');

    SELECT id INTO v_guest_b
    FROM public.reservation_guests
    WHERE tenant_id = c_tenant AND phone_e164 = c_phone_b;

    -- ═══ 7..10 — lettura come MANAGER ══════════════════════════════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_manager, 'role', 'authenticated')::text);

    SELECT COUNT(*) INTO v_count
    FROM public.v_reservation_guest_visits
    WHERE guest_id = v_guest_b AND activity_id = c_garbagnate;

    SELECT COUNT(*) INTO v_visits
    FROM public.v_reservation_guest_visits
    WHERE guest_id = v_guest_b;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '7 — LEAK: visite di Garbagnate viste dal manager che non ha quella sede',
        '0 visite',
        v_count || ' visite',
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '8 — storico visibile al manager (solo le sue sedi)',
        '1 visite',
        v_visits || ' visite',
        CASE WHEN v_visits = 1 THEN 'OK' ELSE 'FALLITO' END
    );

    -- Aggregati come manager (rilettura pulita, due variabili distinte).
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_manager, 'role', 'authenticated')::text);

    SELECT s.visible_visits, s.visible_no_shows
      INTO v_visits, v_no_shows
    FROM public.v_reservation_guest_stats s WHERE s.guest_id = v_guest_b;

    SELECT d.visible_visits INTO v_count
    FROM public.v_reservation_guests_directory d WHERE d.id = v_guest_b;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    v_got := COALESCE(v_visits::text, '(nessuna riga)') || ' visite / '
          || COALESCE(v_no_shows::text, '-') || ' no-show';
    INSERT INTO _esiti VALUES (
        v_ordine,
        '9 — aggregati manager: il no-show e'' avvenuto in una sede non sua',
        '1 visite / 0 no-show',
        v_got,
        CASE WHEN v_visits = 1 AND v_no_shows = 0 THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '10 — elenco rubrica manager: conta solo le visite visibili',
        '1 visite',
        COALESCE(v_count::text, '(profilo assente)') || ' visite',
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 11 — lo stesso profilo letto dall'OWNER ═══════════════════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);

    SELECT s.visible_visits, s.visible_no_shows
      INTO v_visits, v_no_shows
    FROM public.v_reservation_guest_stats s WHERE s.guest_id = v_guest_b;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    v_got := COALESCE(v_visits::text, '(nessuna riga)') || ' visite / '
          || COALESCE(v_no_shows::text, '-') || ' no-show';
    INSERT INTO _esiti VALUES (
        v_ordine,
        '11 — stesso profilo, owner: i conteggi sono relativi a chi guarda',
        '2 visite / 1 no-show',
        v_got,
        CASE WHEN v_visits = 2 AND v_no_shows = 1 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 12/13 — STAFF: rubrica non accessibile ════════════════════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_staff, 'role', 'authenticated')::text);

    SELECT COUNT(*) INTO v_count   FROM public.reservation_guests;
    SELECT COUNT(*) INTO v_visits  FROM public.v_reservation_guests_directory;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '12 — staff (no guests.read): profili leggibili',
        '0 righe',
        v_count || ' righe',
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '13 — staff: elenco rubrica leggibile',
        '0 righe',
        v_visits || ' righe',
        CASE WHEN v_visits = 0 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 14 — VIEWER: rubrica non accessibile ══════════════════════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_viewer, 'role', 'authenticated')::text);

    SELECT COUNT(*) INTO v_count FROM public.reservation_guests;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '14 — viewer (no guests.read): profili leggibili',
        '0 righe',
        v_count || ' righe',
        CASE WHEN v_count = 0 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 15 — scrittura note come MANAGER (ha guests.manage) ═══════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_manager, 'role', 'authenticated')::text);

    UPDATE public.reservation_guests
    SET venue_notes = 'Preferisce il tavolo in fondo',
        tags        = ARRAY['abituale']
    WHERE id = v_guest_b;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '15 — manager (guests.manage): scrive note e tag del locale',
        '1 riga aggiornata',
        v_count || ' righe aggiornate',
        CASE WHEN v_count = 1 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 16 — creazione manuale bloccata ═══════════════════════════════════
    -- Nessuna policy INSERT: i profili nascono solo da una prenotazione.
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_manager, 'role', 'authenticated')::text);

    BEGIN
        INSERT INTO public.reservation_guests (tenant_id, phone_e164, display_name)
        VALUES (c_tenant, '+393000000000', 'Inserito a mano');
        v_got := 'inserito';
    EXCEPTION
        WHEN insufficient_privilege THEN
            v_got := 'bloccato (42501)';
        WHEN OTHERS THEN
            v_got := 'errore inatteso ' || SQLSTATE;
    END;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine,
        '16 — creazione manuale di un profilo (nessuna policy INSERT)',
        'bloccato (42501)',
        v_got,
        CASE WHEN v_got = 'bloccato (42501)' THEN 'OK' ELSE 'FALLITO' END
    );
END;
$$;

SELECT ordine, caso, atteso, ottenuto, verdetto
FROM _esiti
ORDER BY ordine;

SELECT
    count(*) FILTER (WHERE verdetto = 'OK')      AS ok,
    count(*) FILTER (WHERE verdetto = 'FALLITO') AS falliti
FROM _esiti;

ROLLBACK;
