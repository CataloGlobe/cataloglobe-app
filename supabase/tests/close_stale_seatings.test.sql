-- =============================================================================
-- CataloGlobe V2 — Test chiusura automatica tavolate (close_stale_seatings)
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── COSA VERIFICA ───────────────────────────────────────────────────────────
-- Il confine e' `get_service_day_start()` = l'ultima 05:00 Europe/Rome
-- trascorsa. Le tavolate di prova sono piazzate RISPETTO al confine, non a
-- un'ora fissa: il test vale a qualunque ora lo si lanci.
--
--   Il confine, con le cinque righe della specifica (aperta / adesso):
--   a  ieri 21:00 / 00:30   → dopo l'ultima 05:00 (ieri) → intatta
--   b  oggi 01:00 / 03:00   → dopo l'ultima 05:00 (ieri) → intatta
--   c  ieri 21:00 / 06:00   → prima dell'ultima 05:00 (oggi) → chiusa
--   d  oggi 01:00 / 06:00   → prima dell'ultima 05:00 (oggi) → chiusa
--   e  oggi 07:00 / 12:00   → dopo l'ultima 05:00 (oggi) → intatta
--   Qui `now()` non si puo' spostare, quindi ogni riga diventa un offset dal
--   confine reale: a/b/e = aperta DOPO il confine, c/d = aperta PRIMA.
--
--   1  a — aperta 1 minuto dopo il confine          → resta aperta
--   2  b — aperta 3 ore dopo il confine (la notte)  → resta aperta
--   3  c — aperta 8 ore prima del confine (la sera) → chiusa, closed_reason = auto
--   4  d — aperta 4 ore prima del confine (l'una)   → chiusa, closed_reason = auto
--   5  e — aperta ora                               → resta aperta
--   6  gia' chiusa dall'operatore prima del confine → intatta (closed_at, reason)
--   7  con prenotazione `seated` collegata          → chiusa + prenotazione completed
--   8  walk-in (nessuna prenotazione)               → chiuso, niente da specchiare
--   9  il conteggio restituito = tavolate chiuse da questa passata
--  10  prenotazione `cancelled` sulla tavolata      → NON riscritta a completed
--  11  close_seating (operatore) chiude ancora      → closed_reason = operator
--  12  close_seating con motivo invalido            → 22023
--  13  close_seating su tavolata gia' chiusa        → closed_at non si sposta
--  14  ACL: authenticated non esegue le tre funzioni nuove
--  15  ACL: service_role non esegue le tre funzioni nuove
--  16  il confine e' alle 05:00 di Roma e non e' nel futuro
--
-- I casi 1-2 e 6, 10 sono quelli che contano: la notte in corso non si tocca,
-- la passata tocca solo cio' che e' `open`, lo specchio solo cio' che e'
-- `seated`. Tutto il resto appartiene a decisioni prese da qualcun altro.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
-- Da eseguire DOPO 20260914155000..160400 (il cron, 160500, non serve).
--
-- NON e' eseguibile via MCP: quella connessione e' read-only e questo script
-- scrive (poi annulla tutto). Serve una sessione normale.
--
-- Prerequisito: `seed_permissions_test_data.sql` gia' eseguito (tenant
-- McDonald's, owner Lorenzo, sede Comasina).
--
-- ── OUTPUT ──────────────────────────────────────────────────────────────────
-- Una tabella (ordine, caso, atteso, ottenuto, verdetto) piu' una riga di
-- riepilogo. Nessun RAISE NOTICE: Studio non li mostra.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive. La passata
-- chiude ANCHE le tavolate reali di un servizio passato (se ce ne sono): dentro la
-- transazione, poi annullate. Il caso 9 ne tiene conto contandole prima.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- UUID di riferimento (vedi seed_permissions_test_data.sql):
--   tenant McDonald's     5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo         9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   Comasina              347aae51-8df1-4a15-b7f6-40862bf94005
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
    c_owner      CONSTANT text := '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49';

    v_boundary   timestamptz := public.get_service_day_start();

    v_s_a        uuid;   -- caso 1: +1 min
    v_s_b        uuid;   -- caso 2: +3 h
    v_s_c        uuid;   -- caso 3: -8 h
    v_s_d        uuid;   -- caso 4: -4 h
    v_s_e        uuid;   -- caso 5: adesso
    v_s_closed   uuid;   -- caso 6
    v_s_seated   uuid;   -- caso 7 + 10
    v_s_walkin   uuid;   -- caso 8
    v_s_operator uuid;   -- caso 11..13

    v_res_seated    uuid;
    v_res_cancelled uuid;

    v_others     integer;
    v_returned   integer;
    v_closed_at  timestamptz;
    v_closed_at2 timestamptz;
    v_got        text;
    v_ordine     int := 0;
BEGIN
    -- ═══ setup (come ruolo di sessione: RLS non si applica) ════════════════
    -- Tavolate reali gia' di un servizio passato: la passata le chiudera'
    -- (poi rollback).
    SELECT count(*) INTO v_others
      FROM public.seatings
     WHERE status = 'open' AND opened_at < v_boundary;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 2, v_boundary + interval '1 minute', NULL)
    RETURNING id INTO v_s_a;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 2, v_boundary + interval '3 hours', NULL)
    RETURNING id INTO v_s_b;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 2, v_boundary - interval '8 hours', NULL)
    RETURNING id INTO v_s_c;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 2, v_boundary - interval '4 hours', NULL)
    RETURNING id INTO v_s_d;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 2, now(), NULL)
    RETURNING id INTO v_s_e;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id,
                                 status, closed_at, closed_reason)
    VALUES (c_tenant, c_comasina, 2, v_boundary - interval '5 hours', NULL,
            'closed', v_boundary - interval '2 hours', 'operator')
    RETURNING id INTO v_s_closed;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 4, v_boundary - interval '6 hours', NULL)
    RETURNING id INTO v_s_seated;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, NULL, v_boundary - interval '1 hour', NULL)
    RETURNING id INTO v_s_walkin;

    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_at, opened_by_user_id)
    VALUES (c_tenant, c_comasina, 3, now() - interval '10 minutes', NULL)
    RETURNING id INTO v_s_operator;

    -- Una prenotazione seduta e una annullata, entrambe collegate alla
    -- stessa tavolata (caso 7 e caso 10).
    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES (
        c_tenant, c_comasina, (v_boundary AT TIME ZONE 'Europe/Rome')::date - 1, TIME '20:00', 4,
        'Seduto Ieri', '', '', NULL, 'seated', 'manual'
    )
    RETURNING id INTO v_res_seated;

    INSERT INTO public.reservations (
        tenant_id, activity_id, reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, customer_phone_e164,
        status, source
    ) VALUES (
        c_tenant, c_comasina, (v_boundary AT TIME ZONE 'Europe/Rome')::date - 1, TIME '20:00', 2,
        'Annullato Ieri', '', '', NULL, 'cancelled', 'manual'
    )
    RETURNING id INTO v_res_cancelled;

    INSERT INTO public.seating_reservations (tenant_id, activity_id, seating_id, reservation_id)
    VALUES (c_tenant, c_comasina, v_s_seated, v_res_seated),
           (c_tenant, c_comasina, v_s_seated, v_res_cancelled);

    -- ═══ la passata ════════════════════════════════════════════════════════
    SELECT public.close_stale_seatings() INTO v_returned;

    -- ═══ 1..5 — le cinque righe della specifica ════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_a;
    INSERT INTO _esiti VALUES (
        v_ordine, '1 — (a) aperta 1 min dopo il confine → resta aperta',
        'open/NULL', v_got, CASE WHEN v_got = 'open/NULL' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_b;
    INSERT INTO _esiti VALUES (
        v_ordine, '2 — (b) aperta 3 h dopo il confine, la notte in corso → resta aperta',
        'open/NULL', v_got, CASE WHEN v_got = 'open/NULL' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_c;
    INSERT INTO _esiti VALUES (
        v_ordine, '3 — (c) aperta 8 h prima del confine, la sera → chiusa auto',
        'closed/auto', v_got, CASE WHEN v_got = 'closed/auto' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_d;
    INSERT INTO _esiti VALUES (
        v_ordine, '4 — (d) aperta 4 h prima del confine, la notte scorsa → chiusa auto',
        'closed/auto', v_got, CASE WHEN v_got = 'closed/auto' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_e;
    INSERT INTO _esiti VALUES (
        v_ordine, '5 — (e) aperta adesso → resta aperta',
        'open/NULL', v_got, CASE WHEN v_got = 'open/NULL' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 6 — gia' chiusa dall'operatore → intatta ══════════════════════════
    v_ordine := v_ordine + 1;
    SELECT closed_reason || '/' ||
           CASE WHEN closed_at = v_boundary - interval '2 hours' THEN 'closed_at intatto'
                ELSE 'closed_at SPOSTATO' END
      INTO v_got
      FROM public.seatings WHERE id = v_s_closed;
    INSERT INTO _esiti VALUES (
        v_ordine, '6 — gia'' chiusa dall''operatore prima del confine → non toccata',
        'operator/closed_at intatto', v_got,
        CASE WHEN v_got = 'operator/closed_at intatto' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 7 — prenotazione seated → completed ═══════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT r.status || '/' || CASE WHEN r.completed_at IS NULL THEN 'completed_at NULL' ELSE 'completed_at ok' END
      INTO v_got
      FROM public.reservations r WHERE r.id = v_res_seated;
    INSERT INTO _esiti VALUES (
        v_ordine, '7 — prenotazione seated sulla tavolata → completed con completed_at',
        'completed/completed_at ok', v_got,
        CASE WHEN v_got = 'completed/completed_at ok' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 8 — walk-in → chiuso ══════════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT status || '/' || COALESCE(closed_reason, 'NULL') INTO v_got
      FROM public.seatings WHERE id = v_s_walkin;
    INSERT INTO _esiti VALUES (
        v_ordine, '8 — walk-in di un servizio passato → chiuso auto (niente da specchiare)',
        'closed/auto', v_got, CASE WHEN v_got = 'closed/auto' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 9 — conteggio ═════════════════════════════════════════════════════
    -- Le nostre da chiudere: c, d, seated, walk-in = 4. Piu' le reali.
    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine, '9 — conteggio restituito = 4 nostre + ' || v_others || ' reali',
        (4 + v_others)::text, v_returned::text,
        CASE WHEN v_returned = 4 + v_others THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 10 — prenotazione cancelled non resuscitata ═══════════════════════
    v_ordine := v_ordine + 1;
    SELECT r.status INTO v_got FROM public.reservations r WHERE r.id = v_res_cancelled;
    INSERT INTO _esiti VALUES (
        v_ordine, '10 — prenotazione cancelled sulla tavolata → resta cancelled',
        'cancelled', v_got, CASE WHEN v_got = 'cancelled' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 11..13 — close_seating come OWNER (regressione) ════════════════════
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);

    -- 11: chiusura dell'operatore.
    SELECT (public.close_seating(v_s_operator, 'operator')).closed_at INTO v_closed_at;

    -- 12: motivo invalido. Il controllo del motivo (punto 2) precede quello
    --    "gia' chiusa" (punto 3): 22023 anche su tavolata chiusa, come prima.
    BEGIN
        PERFORM public.close_seating(v_s_operator, 'boh');
        v_got := 'accettato';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN v_got := '22023';
        WHEN OTHERS THEN v_got := 'errore inatteso ' || SQLSTATE;
    END;

    -- 13: seconda pressione, il timestamp non si sposta.
    PERFORM pg_sleep(0.05);
    SELECT (public.close_seating(v_s_operator, 'operator')).closed_at INTO v_closed_at2;

    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine, '11 — close_seating dall''owner → closed/operator',
        'closed/operator',
        (SELECT status || '/' || COALESCE(closed_reason, 'NULL') FROM public.seatings WHERE id = v_s_operator),
        CASE WHEN (SELECT status || '/' || COALESCE(closed_reason, 'NULL') FROM public.seatings WHERE id = v_s_operator) = 'closed/operator'
             THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine, '12 — close_seating con motivo invalido → 22023',
        '22023', v_got, CASE WHEN v_got = '22023' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (
        v_ordine, '13 — close_seating su tavolata gia'' chiusa → closed_at intatto',
        'intatto',
        CASE WHEN v_closed_at IS NOT NULL AND v_closed_at = v_closed_at2 THEN 'intatto' ELSE 'spostato' END,
        CASE WHEN v_closed_at IS NOT NULL AND v_closed_at = v_closed_at2 THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 14..15 — ACL ══════════════════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT
        has_function_privilege('authenticated', 'public.close_stale_seatings()', 'EXECUTE')::text || '/' ||
        has_function_privilege('authenticated', 'public._close_seating_unchecked(uuid,text)', 'EXECUTE')::text || '/' ||
        has_function_privilege('authenticated', 'public.get_service_day_start()', 'EXECUTE')::text
      INTO v_got;
    INSERT INTO _esiti VALUES (
        v_ordine, '14 — ACL authenticated: close_stale_seatings / _close_seating_unchecked / get_service_day_start',
        'false/false/false', v_got, CASE WHEN v_got = 'false/false/false' THEN 'OK' ELSE 'FALLITO' END
    );

    v_ordine := v_ordine + 1;
    SELECT
        has_function_privilege('service_role', 'public.close_stale_seatings()', 'EXECUTE')::text || '/' ||
        has_function_privilege('service_role', 'public._close_seating_unchecked(uuid,text)', 'EXECUTE')::text || '/' ||
        has_function_privilege('service_role', 'public.get_service_day_start()', 'EXECUTE')::text
      INTO v_got;
    INSERT INTO _esiti VALUES (
        v_ordine, '15 — ACL service_role: close_stale_seatings / _close_seating_unchecked / get_service_day_start',
        'false/false/false', v_got, CASE WHEN v_got = 'false/false/false' THEN 'OK' ELSE 'FALLITO' END
    );

    -- ═══ 16 — il confine: alle 05:00 di Roma, nel passato, entro 24 ore ═══
    v_ordine := v_ordine + 1;
    SELECT to_char(v_boundary AT TIME ZONE 'Europe/Rome', 'HH24:MI') || '/' ||
           CASE WHEN v_boundary <= now() AND v_boundary > now() - interval '24 hours'
                THEN 'ultime 24 h' ELSE 'FUORI' END
      INTO v_got;
    INSERT INTO _esiti VALUES (
        v_ordine, '16 — get_service_day_start: le 05:00 di Roma, trascorse da meno di 24 h',
        '05:00/ultime 24 h', v_got,
        CASE WHEN v_got = '05:00/ultime 24 h' THEN 'OK' ELSE 'FALLITO' END
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
