-- =============================================================================
-- CataloGlobe V2 — Test BLOCCO 3 · FASE 3.1: il conto appartiene alla tavolata
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── COSA VERIFICA ───────────────────────────────────────────────────────────
--   1  primo ordine su tavolo SENZA tavolata → ne nasce una (utente NULL, coperti NULL)
--   2  ... e la tavolata occupa quel tavolo in seating_tables
--   3  secondo commensale, stesso tavolo, altra sessione → stessa tavolata, una sola
--   4  primo ordine su tavolo CON tavolata aperta (dell'host) → si attacca, nessuna nuova
--   5  primo ordine su tavolo la cui unica tavolata e' CHIUSA → tavolata nuova
--   6  undo_seating con conto APERTO collegato → 22023 SEATING_HAS_BILLS
--   7  undo_seating con conto CHIUSO collegato → 22023 SEATING_HAS_BILLS
--   8  close_seating, ordini tutti terminali, nessuna action → chiude tavolata E conti
--   9  ... e scade le sessioni cliente dei conti
--  10  close_seating idempotente: closed_at non si sposta, niente errori
--  11  close_seating con ordine da risolvere e nessuna action → 22023 OPEN_ORDERS_NEED_ACTION:1
--  12  close_seating con action 'cancel' → ordine cancelled con motivo «Servizio concluso», conto e tavolata chiusi
--  13  close_table_with_resolution('deliver') → ordine delivered, conto chiuso, TAVOLATA chiusa (operator)
--  14  close_table_with_resolution idempotente: seconda chiamata contatori a zero
--  15  spazzino: tavolata vecchia senza ordini da decidere → chiusa (auto) col suo conto
--  16  spazzino: tavolata vecchia con ordine da decidere → saltata, tutto aperto
--  17  spazzino: il ritorno distingue closed / skipped
--  18  ACL: authenticated e service_role non eseguono i due cuori nuovi
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
-- Da eseguire DOPO 20260915130000..131300 e 140100..140600 (motivo di annullamento).
--
-- NON e' eseguibile via MCP: quella connessione e' read-only e questo script
-- scrive (poi annulla tutto). Serve una sessione normale.
--
-- Prerequisito: `seed_permissions_test_data.sql` (tenant McDonald's, owner
-- Lorenzo). Sede: Garbagnate — ha la feature `table_ordering`, i tavoli e un
-- prodotto: `submit_order_atomic` viene chiamata DAVVERO, non simulata.
--
-- ── OUTPUT ──────────────────────────────────────────────────────────────────
-- Una tabella (ordine, caso, atteso, ottenuto, verdetto) piu' una riga di
-- riepilogo. Nessun RAISE NOTICE: Studio non li mostra.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive. Lo spazzino
-- e `close_table_with_resolution` toccano ANCHE righe reali della sede (poi
-- rollback): i casi 14 e 17 ne tengono conto contandole prima.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- UUID di riferimento:
--   tenant McDonald's     5b37c952-1add-4196-aab3-9775d98a9c32
--   owner Lorenzo         9603ef2a-9f9d-4ebc-8d05-3b2600e36e49
--   Garbagnate            1f62cac4-2ba9-436b-b075-057203658422
--   tavolo "T TEST"       4c34caf8-2eee-48ca-8764-bbd68b182d63
--   tavolo "T1"           02047c9a-d581-4c97-8767-16debdfbddf6
--   un prodotto           3b263833-bb1f-4210-baab-96b9bbbd52cf
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
    c_tenant    CONSTANT uuid := '5b37c952-1add-4196-aab3-9775d98a9c32';
    c_activity  CONSTANT uuid := '1f62cac4-2ba9-436b-b075-057203658422';
    c_owner     CONSTANT text := '9603ef2a-9f9d-4ebc-8d05-3b2600e36e49';
    c_t_test    CONSTANT uuid := '4c34caf8-2eee-48ca-8764-bbd68b182d63';
    c_t1        CONSTANT uuid := '02047c9a-d581-4c97-8767-16debdfbddf6';
    c_product   CONSTANT uuid := '3b263833-bb1f-4210-baab-96b9bbbd52cf';
    c_items     CONSTANT jsonb := jsonb_build_array(jsonb_build_object(
        'product_id', '3b263833-bb1f-4210-baab-96b9bbbd52cf',
        'product_name_snapshot', 'Test 3.1', 'unit_price_snapshot', 1,
        'quantity', 1, 'line_total', 1, 'options_snapshot', '{}'::jsonb
    ));

    v_boundary  timestamptz := public.get_service_day_start();

    v_sess_a uuid; v_sess_b uuid; v_sess_c uuid; v_sess_d uuid;
    v_grp_a uuid;  v_grp_b uuid;  v_grp_c uuid;  v_grp_d uuid;
    v_ord_a uuid;  v_ord_b uuid;  v_ord_c uuid;  v_ord_d uuid;
    v_seat_1 uuid; v_seat_host uuid; v_seat_closed uuid; v_seat_5 uuid;
    v_seat_e uuid; v_grp_e uuid;
    v_seat_f uuid; v_grp_f uuid; v_sess_f uuid; v_ord_f uuid;
    v_seat_g uuid; v_grp_g uuid; v_sess_g uuid; v_ord_g uuid;

    v_res        jsonb;
    v_got        text;
    v_count      bigint;
    v_closed_at  timestamptz;
    v_closed_at2 timestamptz;
    v_others_stale_closable int;
    v_others_stale_skipped  int;
    v_ordine     int := 0;
BEGIN
    -- ═══ setup: quattro sessioni cliente (telefoni), tutte vive ═══════════
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t_test, now() + interval '12 hours') RETURNING id INTO v_sess_a;
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t_test, now() + interval '12 hours') RETURNING id INTO v_sess_b;
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t1, now() + interval '12 hours') RETURNING id INTO v_sess_c;
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t1, now() + interval '12 hours') RETURNING id INTO v_sess_d;

    -- ═══ 1-2 — primo ordine su T TEST, nessuna tavolata aperta ═════════════
    -- (le tavolate reali sono chiuse dal cron; se ce ne fosse una aperta su
    --  T TEST il caso 1 fallirebbe dicendo "esistente": e' un dato, non un bug)
    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t_test, v_sess_a, 'Anna', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_a := (v_res->>'order_group_id')::uuid;
    v_ord_a := (v_res->>'order_id')::uuid;
    SELECT og.seating_id INTO v_seat_1 FROM public.order_groups og WHERE og.id = v_grp_a;

    v_ordine := v_ordine + 1;
    SELECT CASE
             WHEN v_seat_1 IS NULL THEN 'seating_id NULL'
             ELSE 'nata/' || CASE WHEN s.opened_by_user_id IS NULL THEN 'utente NULL' ELSE 'utente ' || s.opened_by_user_id END
                  || '/' || CASE WHEN s.party_size IS NULL THEN 'coperti NULL' ELSE 'coperti ' || s.party_size END
                  || '/' || s.status
           END
      INTO v_got FROM public.seatings s WHERE s.id = v_seat_1;
    INSERT INTO _esiti VALUES (v_ordine, '1 — primo ordine senza tavolata → tavolata nuova, senza utente e coperti',
        'nata/utente NULL/coperti NULL/open', COALESCE(v_got, 'seating_id NULL'),
        CASE WHEN v_got = 'nata/utente NULL/coperti NULL/open' THEN 'OK' ELSE 'FALLITO' END);

    v_ordine := v_ordine + 1;
    SELECT count(*) INTO v_count FROM public.seating_tables st WHERE st.seating_id = v_seat_1 AND st.table_id = c_t_test;
    INSERT INTO _esiti VALUES (v_ordine, '2 — la tavolata nata occupa il tavolo (seating_tables)',
        '1 riga', v_count || ' riga/e', CASE WHEN v_count = 1 THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 3 — secondo commensale, stesso tavolo, altra sessione ═════════════
    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t_test, v_sess_b, 'Bruno', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_b := (v_res->>'order_group_id')::uuid;
    v_ord_b := (v_res->>'order_id')::uuid;

    v_ordine := v_ordine + 1;
    SELECT (SELECT og.seating_id = v_seat_1 FROM public.order_groups og WHERE og.id = v_grp_b)::text
           || '/' ||
           (SELECT count(*) FROM public.seatings s JOIN public.seating_tables st ON st.seating_id = s.id
             WHERE st.table_id = c_t_test AND s.status = 'open')::text
      INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '3 — due commensali, due conti, UNA tavolata (stesso id / aperte sul tavolo)',
        'true/1', v_got, CASE WHEN v_got = 'true/1' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 4 — tavolo T1 con tavolata aperta dall'host ═══════════════════════
    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_by_user_id)
    VALUES (c_tenant, c_activity, 3, c_owner::uuid) RETURNING id INTO v_seat_host;
    INSERT INTO public.seating_tables (tenant_id, activity_id, seating_id, table_id)
    VALUES (c_tenant, c_activity, v_seat_host, c_t1);

    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t1, v_sess_c, 'Carla', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_c := (v_res->>'order_group_id')::uuid;
    v_ord_c := (v_res->>'order_id')::uuid;

    v_ordine := v_ordine + 1;
    SELECT (SELECT og.seating_id = v_seat_host FROM public.order_groups og WHERE og.id = v_grp_c)::text
           || '/' ||
           (SELECT count(*) FROM public.seatings s JOIN public.seating_tables st ON st.seating_id = s.id
             WHERE st.table_id = c_t1 AND s.status = 'open')::text
      INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '4 — tavolo con tavolata dell''host → il conto si attacca, nessuna nuova',
        'true/1', v_got, CASE WHEN v_got = 'true/1' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 5 — unica tavolata del tavolo CHIUSA → nuova ══════════════════════
    -- Chiudo la tavolata dell'host portando via il suo conto (annullo l'ordine
    -- di Carla, cosi' non resta niente da decidere), poi un altro telefono.
    UPDATE public.orders SET status = 'cancelled', cancelled_at = now(), cancelled_by = 'admin',
           cancellation_reason = 'test', version = version + 1 WHERE id = v_ord_c;
    -- (gruppo non verificato + tutti annullati → il trigger lo ha chiuso da solo)
    UPDATE public.seatings SET status = 'closed', closed_at = now(), closed_reason = 'operator'
     WHERE id = v_seat_host;
    v_seat_closed := v_seat_host;

    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t1, v_sess_d, 'Dario', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_d := (v_res->>'order_group_id')::uuid;
    v_ord_d := (v_res->>'order_id')::uuid;
    SELECT og.seating_id INTO v_seat_5 FROM public.order_groups og WHERE og.id = v_grp_d;

    v_ordine := v_ordine + 1;
    v_got := CASE WHEN v_seat_5 IS NULL THEN 'seating_id NULL'
                  WHEN v_seat_5 = v_seat_closed THEN 'attaccata alla CHIUSA'
                  ELSE 'nuova/' || (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_5) END;
    INSERT INTO _esiti VALUES (v_ordine, '5 — unica tavolata del tavolo chiusa → ne nasce una nuova',
        'nuova/open/NULL', v_got, CASE WHEN v_got = 'nuova/open/NULL' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 6-7 — undo_seating con conti collegati (aperto / chiuso) ══════════
    -- Tavolata E aperta, con un conto gia' CHIUSO collegato.
    INSERT INTO public.seatings (tenant_id, activity_id, party_size, opened_by_user_id)
    VALUES (c_tenant, c_activity, NULL, NULL) RETURNING id INTO v_seat_e;
    INSERT INTO public.order_groups (tenant_id, activity_id, table_id, status, closed_at, verified_at, seating_id)
    VALUES (c_tenant, c_activity, c_t_test, 'closed', now(), now(), v_seat_e) RETURNING id INTO v_grp_e;

    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);
    BEGIN
        PERFORM public.undo_seating(v_seat_1);   -- conti APERTI (Anna, Bruno)
        v_got := 'annullata';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN v_got := CASE WHEN SQLERRM LIKE 'SEATING_HAS_BILLS:%' THEN '22023 SEATING_HAS_BILLS' ELSE '22023 altro: ' || SQLERRM END;
        WHEN OTHERS THEN v_got := 'errore inatteso ' || SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (v_ordine, '6 — undo_seating con conto APERTO collegato → rifiutato',
        '22023 SEATING_HAS_BILLS', v_got, CASE WHEN v_got = '22023 SEATING_HAS_BILLS' THEN 'OK' ELSE 'FALLITO' END);

    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);
    BEGIN
        PERFORM public.undo_seating(v_seat_e);   -- conto CHIUSO
        v_got := 'annullata';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN v_got := CASE WHEN SQLERRM LIKE 'SEATING_HAS_BILLS:%' THEN '22023 SEATING_HAS_BILLS' ELSE '22023 altro: ' || SQLERRM END;
        WHEN OTHERS THEN v_got := 'errore inatteso ' || SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (v_ordine, '7 — undo_seating con conto CHIUSO collegato → rifiutato lo stesso',
        '22023 SEATING_HAS_BILLS', v_got, CASE WHEN v_got = '22023 SEATING_HAS_BILLS' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 8-10 — close_seating, ordini tutti terminali ══════════════════════
    -- Anna e Bruno serviti: prima `acknowledged` (verifica il gruppo), poi
    -- `delivered` — come farebbe la cucina.
    UPDATE public.orders SET status = 'acknowledged', acknowledged_at = now(), version = version + 1
     WHERE id IN (v_ord_a, v_ord_b);
    UPDATE public.orders SET status = 'delivered', delivered_at = now(), version = version + 1
     WHERE id IN (v_ord_a, v_ord_b);

    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);
    SELECT (public.close_seating(v_seat_1, 'operator')).closed_at INTO v_closed_at;
    PERFORM pg_sleep(0.05);
    SELECT (public.close_seating(v_seat_1, 'operator')).closed_at INTO v_closed_at2;
    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    SELECT (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_1) || '/' ||
           (SELECT string_agg(og.status, ',' ORDER BY og.created_at) FROM public.order_groups og WHERE og.id IN (v_grp_a, v_grp_b))
      INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '8 — close_seating senza action, ordini terminali → tavolata e i due conti chiusi',
        'closed/operator/closed,closed', v_got, CASE WHEN v_got = 'closed/operator/closed,closed' THEN 'OK' ELSE 'FALLITO' END);

    v_ordine := v_ordine + 1;
    SELECT count(*) INTO v_count FROM public.customer_sessions cs WHERE cs.id IN (v_sess_a, v_sess_b) AND cs.expires_at > now();
    INSERT INTO _esiti VALUES (v_ordine, '9 — ... e le sessioni cliente dei conti sono scadute',
        '0 vive', v_count || ' vive', CASE WHEN v_count = 0 THEN 'OK' ELSE 'FALLITO' END);

    v_ordine := v_ordine + 1;
    v_got := CASE WHEN v_closed_at IS NOT NULL AND v_closed_at = v_closed_at2 THEN 'intatto' ELSE 'spostato' END;
    INSERT INTO _esiti VALUES (v_ordine, '10 — close_seating idempotente: closed_at non si sposta',
        'intatto', v_got, CASE WHEN v_got = 'intatto' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 11-12 — close_seating con ordine da risolvere ═════════════════════
    -- La tavolata 5 (Dario) ha un ordine `submitted`.
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);
    BEGIN
        PERFORM public.close_seating(v_seat_5, 'operator');
        v_got := 'chiusa senza chiedere';
    EXCEPTION
        WHEN SQLSTATE '22023' THEN v_got := '22023 ' || SQLERRM;
        WHEN OTHERS THEN v_got := 'errore inatteso ' || SQLSTATE;
    END;
    EXECUTE 'RESET ROLE';
    v_ordine := v_ordine + 1;
    INSERT INTO _esiti VALUES (v_ordine, '11 — close_seating con un ordine da risolvere e nessuna action → 22023 col motivo',
        '22023 OPEN_ORDERS_NEED_ACTION:1', v_got, CASE WHEN v_got = '22023 OPEN_ORDERS_NEED_ACTION:1' THEN 'OK' ELSE 'FALLITO' END);

    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format('SET LOCAL "request.jwt.claims" TO %L',
                   json_build_object('sub', c_owner, 'role', 'authenticated')::text);
    PERFORM public.close_seating(v_seat_5, 'operator', 'cancel');
    EXECUTE 'RESET ROLE';

    v_ordine := v_ordine + 1;
    SELECT (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_5) || '/' ||
           (SELECT og.status FROM public.order_groups og WHERE og.id = v_grp_d) || '/' ||
           (SELECT o.status || ':' || COALESCE(o.cancelled_by, '') || ':' || COALESCE(o.cancellation_reason, '')
              FROM public.orders o WHERE o.id = v_ord_d)
      INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '12 — close_seating con action cancel → annullato con motivo «Servizio concluso», conto e tavolata chiusi',
        'closed/operator/closed/cancelled:admin:Servizio concluso', v_got,
        CASE WHEN v_got = 'closed/operator/closed/cancelled:admin:Servizio concluso' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 13-14 — close_table_with_resolution chiude anche la tavolata ══════
    -- Tavolata F su T TEST (che ora non ha tavolate aperte), un ordine
    -- acknowledged (verificato), poi «Chiudi tavolo» con deliver.
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t_test, now() + interval '12 hours') RETURNING id INTO v_sess_f;
    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t_test, v_sess_f, 'Fabio', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_f := (v_res->>'order_group_id')::uuid;
    v_ord_f := (v_res->>'order_id')::uuid;
    SELECT og.seating_id INTO v_seat_f FROM public.order_groups og WHERE og.id = v_grp_f;
    UPDATE public.orders SET status = 'acknowledged', acknowledged_at = now(), version = version + 1 WHERE id = v_ord_f;

    v_res := public.close_table_with_resolution(c_t_test, c_tenant, 'deliver');

    v_ordine := v_ordine + 1;
    SELECT (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_f) || '/' ||
           (SELECT og.status FROM public.order_groups og WHERE og.id = v_grp_f) || '/' ||
           (SELECT o.status FROM public.orders o WHERE o.id = v_ord_f) || '/' ||
           (v_res->>'closed_seatings_count')
      INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '13 — Chiudi tavolo (deliver) → ordine servito, conto chiuso, tavolata chiusa dall''operatore',
        'closed/operator/closed/delivered/1', v_got,
        CASE WHEN v_got = 'closed/operator/closed/delivered/1' THEN 'OK' ELSE 'FALLITO' END);

    v_res := public.close_table_with_resolution(c_t_test, c_tenant, 'none');
    v_ordine := v_ordine + 1;
    v_got := (v_res->>'closed_groups_count') || '/' || (v_res->>'resolved_orders_count') || '/' || (v_res->>'closed_seatings_count');
    INSERT INTO _esiti VALUES (v_ordine, '14 — Chiudi tavolo idempotente: seconda chiamata non chiude niente',
        '0/0/0', v_got, CASE WHEN v_got = '0/0/0' THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 15-17 — lo spazzino ═══════════════════════════════════════════════
    -- Reali gia' vecchie, prima di aggiungere le nostre: quante chiudibili,
    -- quante da saltare.
    SELECT count(*) FILTER (WHERE NOT has_open), count(*) FILTER (WHERE has_open)
      INTO v_others_stale_closable, v_others_stale_skipped
      FROM (
        SELECT s.id, EXISTS (
            SELECT 1 FROM public.orders o JOIN public.order_groups og ON og.id = o.order_group_id
             WHERE og.seating_id = s.id AND og.status = 'open'
               AND o.status IN ('submitted','acknowledged','ready')) AS has_open
          FROM public.seatings s WHERE s.status = 'open' AND s.opened_at < v_boundary
      ) x;

    -- G: vecchia, ordine servito → chiudibile. H (riuso v_seat_g): vecchia, ordine submitted → da saltare.
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t1, now() + interval '12 hours') RETURNING id INTO v_sess_g;
    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t1, v_sess_g, 'Gino', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_g := (v_res->>'order_group_id')::uuid;
    v_ord_g := (v_res->>'order_id')::uuid;
    SELECT og.seating_id INTO v_seat_g FROM public.order_groups og WHERE og.id = v_grp_g;
    UPDATE public.orders SET status = 'acknowledged', acknowledged_at = now(), version = version + 1 WHERE id = v_ord_g;
    UPDATE public.orders SET status = 'delivered', delivered_at = now(), version = version + 1 WHERE id = v_ord_g;
    UPDATE public.seatings SET opened_at = v_boundary - interval '8 hours' WHERE id = v_seat_g;

    -- H su T TEST: tavolata nuova (T TEST e' stato chiuso al caso 13).
    INSERT INTO public.customer_sessions (tenant_id, activity_id, current_table_id, expires_at)
    VALUES (c_tenant, c_activity, c_t_test, now() + interval '12 hours') RETURNING id INTO v_sess_f;
    v_res := public.submit_order_atomic(
        c_tenant, c_activity, c_t_test, v_sess_f, 'Hanna', NULL, 1, NULL, c_items, NULL, NULL
    );
    v_grp_e := (v_res->>'order_group_id')::uuid;
    v_ord_f := (v_res->>'order_id')::uuid;
    SELECT og.seating_id INTO v_seat_e FROM public.order_groups og WHERE og.id = v_grp_e;
    UPDATE public.seatings SET opened_at = v_boundary - interval '8 hours' WHERE id = v_seat_e;

    v_res := public.close_stale_seatings();

    v_ordine := v_ordine + 1;
    SELECT (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_g) || '/' || (SELECT og.status FROM public.order_groups og WHERE og.id = v_grp_g) INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '15 — spazzino: vecchia, ordine servito → chiusa (auto) col suo conto',
        'closed/auto/closed', v_got, CASE WHEN v_got = 'closed/auto/closed' THEN 'OK' ELSE 'FALLITO' END);

    v_ordine := v_ordine + 1;
    SELECT (SELECT s.status || '/' || COALESCE(s.closed_reason, 'NULL') FROM public.seatings s WHERE s.id = v_seat_e) || '/' || (SELECT og.status FROM public.order_groups og WHERE og.id = v_grp_e)
           || '/' || (SELECT o.status FROM public.orders o WHERE o.id = v_ord_f) INTO v_got;
    INSERT INTO _esiti VALUES (v_ordine, '16 — spazzino: vecchia, ordine da decidere → saltata, tutto aperto',
        'open/NULL/open/submitted', v_got, CASE WHEN v_got = 'open/NULL/open/submitted' THEN 'OK' ELSE 'FALLITO' END);

    v_ordine := v_ordine + 1;
    v_got := (v_res->>'closed') || '/' || (v_res->>'skipped');
    INSERT INTO _esiti VALUES (v_ordine,
        '17 — spazzino: ritorno {closed, skipped} = (1 + ' || v_others_stale_closable || ' reali) / (1 + ' || v_others_stale_skipped || ' reali)',
        (1 + v_others_stale_closable) || '/' || (1 + v_others_stale_skipped), v_got,
        CASE WHEN v_got = (1 + v_others_stale_closable) || '/' || (1 + v_others_stale_skipped) THEN 'OK' ELSE 'FALLITO' END);

    -- ═══ 18 — ACL ══════════════════════════════════════════════════════════
    v_ordine := v_ordine + 1;
    SELECT string_agg(
             r || ':' || has_function_privilege(r, 'public._open_seating_for_table_unchecked(uuid,uuid,uuid)', 'EXECUTE')::text
               || '/' || has_function_privilege(r, 'public._close_order_group_unchecked(uuid,text,text)', 'EXECUTE')::text
               || '/' || has_function_privilege(r, 'public.close_stale_seatings()', 'EXECUTE')::text
               || '/' || has_function_privilege(r, 'public.close_seating(uuid,text,text)', 'EXECUTE')::text,
             ' ' ORDER BY r)
      INTO v_got
      FROM unnest(ARRAY['anon','authenticated','service_role']) r;
    INSERT INTO _esiti VALUES (v_ordine,
        '18 — ACL (open_unchecked/close_group_unchecked/stale/close_seating) per anon, authenticated, service_role',
        'anon:false/false/false/false authenticated:false/false/false/true service_role:false/false/false/false', v_got,
        CASE WHEN v_got = 'anon:false/false/false/false authenticated:false/false/false/true service_role:false/false/false/false'
             THEN 'OK' ELSE 'FALLITO' END);
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
