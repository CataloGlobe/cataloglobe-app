-- =============================================================================
-- CataloGlobe V2 — Test di comportamento del pacing per fascia oraria
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── COSA VERIFICA ───────────────────────────────────────────────────────────
-- I sei requisiti della spec, piu' tre casi che difendono decisioni prese in
-- fase di progetto e che altrimenti resterebbero senza rete:
--   a  tetto coperti raggiunto           → slot chiuso online
--   b  tetto prenotazioni raggiunto, coperti liberi → slot chiuso online
--   c  solo tetto coperti                → il tetto prenotazioni non interferisce
--   d  solo tetto prenotazioni           → il tetto coperti non interferisce
--   e  entrambi NULL                     → comportamento invariato
--   f  passo 30: 20:15 cade nel bucket 20:00–20:30
--   g  passo 15: 20:15 NON cade nel bucket 20:00 (contrappunto di f)
--   h  pacing SENZA capienza configurata → il gate sta sopra l'early-return
--   i  arrivi, non presenze: il bucket adiacente non pesa
--   j  righe non attive (cancelled) ignorate
--   k  canale manuale mai bloccato (INSERT diretto sopra il tetto)
--
-- La concorrenza NON e' qui: richiede due sessioni simultanee e vive in
-- `reservation_pacing_concurrency_test.sql`.
-- La parita' col motore di capienza pre-pacing e' in
-- `reservation_pacing_parity_tests.sql`.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
-- Da eseguire DOPO aver applicato 20260831140000 e 20260831150000..150003.
--
-- NON e' eseguibile via MCP: quella connessione e' in transazione read-only e
-- questo script scrive (poi annulla tutto). Serve una sessione normale.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive e la
-- configurazione della sede di prova torna com'era. Le prenotazioni di prova
-- stanno nel 2099, fuori da qualunque dato reale.
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
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
    v_activity_id uuid;
    v_tenant_id   uuid;

    c_date  CONSTANT date := DATE '2099-04-20';
    c_email CONSTANT text := 'pacing@example.invalid';

    v_res_id  uuid;
    v_status  text;
    v_reason  text;
    v_got     text;
    v_ordine  int := 0;
    i         int;
    r         RECORD;
BEGIN
    SELECT a.id, a.tenant_id INTO v_activity_id, v_tenant_id
    FROM public.activities a
    WHERE a.enable_reservations
      AND public.activity_has_feature(a.id, 'table_reservation')
    ORDER BY a.created_at
    LIMIT 1;

    IF v_activity_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna sede con enable_reservations e feature table_reservation attiva: impossibile testare.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            -- caso
            --   cap  = reservation_capacity (NULL per isolare il pacing dalla capienza)
            --   step = reservation_pacing_slot_minutes
            --   cov  = reservation_pacing_max_covers
            --   bok  = reservation_pacing_max_bookings
            --   seed_times / seed_parties = prenotazioni preesistenti
            --   cand_time / cand_party    = candidato online
            ('a — tetto coperti raggiunto',
             NULL::int, 15, 8::int, NULL::int,
             ARRAY[TIME '20:00']::time[], ARRAY[6]::int[], 'confirmed',
             TIME '20:00', 4, 'full/pacing_covers/norow'),

            ('b — tetto prenotazioni raggiunto, coperti liberi',
             NULL, 15, 100, 2,
             ARRAY[TIME '20:00', TIME '20:05']::time[], ARRAY[2,2]::int[], 'confirmed',
             TIME '20:10', 2, 'full/pacing_bookings/norow'),

            ('c — solo tetto coperti: le prenotazioni non interferiscono',
             NULL, 15, 8, NULL,
             ARRAY[TIME '20:00', TIME '20:05', TIME '20:10']::time[], ARRAY[1,1,1]::int[], 'confirmed',
             TIME '20:00', 1, 'pending/-/row'),

            ('d — solo tetto prenotazioni: i coperti non interferiscono',
             NULL, 15, NULL, 3,
             ARRAY[TIME '20:00', TIME '20:05']::time[], ARRAY[20,20]::int[], 'confirmed',
             TIME '20:10', 20, 'pending/-/row'),

            ('e — entrambi i tetti NULL: invariato',
             NULL, 15, NULL, NULL,
             ARRAY[TIME '20:00']::time[], ARRAY[50]::int[], 'confirmed',
             TIME '20:00', 50, 'pending/-/row'),

            ('f — passo 30: 20:15 cade nel bucket 20:00-20:30',
             NULL, 30, 8, NULL,
             ARRAY[TIME '20:00']::time[], ARRAY[6]::int[], 'confirmed',
             TIME '20:15', 4, 'full/pacing_covers/norow'),

            ('g — passo 15: 20:15 e'' un bucket diverso da 20:00',
             NULL, 15, 8, NULL,
             ARRAY[TIME '20:00']::time[], ARRAY[6]::int[], 'confirmed',
             TIME '20:15', 4, 'pending/-/row'),

            ('h — pacing senza capienza configurata',
             NULL, 15, 4, NULL,
             ARRAY[TIME '20:00']::time[], ARRAY[4]::int[], 'confirmed',
             TIME '20:00', 2, 'full/pacing_covers/norow'),

            ('i — arrivi non presenze: il bucket adiacente non pesa',
             NULL, 15, 4, NULL,
             ARRAY[TIME '19:45']::time[], ARRAY[10]::int[], 'confirmed',
             TIME '20:00', 4, 'pending/-/row'),

            ('j — righe cancelled ignorate dal pacing',
             NULL, 15, 4, NULL,
             ARRAY[TIME '20:00']::time[], ARRAY[10]::int[], 'cancelled',
             TIME '20:00', 4, 'pending/-/row')
        ) AS t(caso, cap, step, cov, bok,
               seed_times, seed_parties, seed_status,
               cand_time, cand_party, atteso)
    LOOP
        v_ordine := v_ordine + 1;

        DELETE FROM public.reservations
        WHERE activity_id = v_activity_id
          AND reservation_date BETWEEN c_date - 1 AND c_date + 1;

        -- `manuale` sempre: il ramo auto richiede una capienza e qui la
        -- capienza e' NULL apposta, per isolare il pacing.
        UPDATE public.activities
        SET reservation_capacity             = r.cap,
            reservation_duration_minutes     = 120,
            reservation_confirmation_mode    = 'manuale',
            reservation_overbooking_form     = 'hard',
            reservation_pacing_slot_minutes  = r.step,
            reservation_pacing_max_covers    = r.cov,
            reservation_pacing_max_bookings  = r.bok
        WHERE id = v_activity_id;

        FOR i IN 1..COALESCE(array_length(r.seed_times, 1), 0) LOOP
            INSERT INTO public.reservations
                (tenant_id, activity_id, reservation_date, reservation_time,
                 party_size, customer_name, customer_email, customer_phone,
                 status, source)
            VALUES
                (v_tenant_id, v_activity_id, c_date, r.seed_times[i],
                 r.seed_parties[i], 'Seed pacing', c_email, '+390000000000',
                 r.seed_status, 'manual');
        END LOOP;

        SELECT p.reservation_id, p.status, p.reason
        INTO v_res_id, v_status, v_reason
        FROM public.place_online_reservation(
            v_activity_id, c_date, r.cand_time, r.cand_party,
            'Candidato pacing', c_email, '+390000000001', NULL, 'online'
        ) p;

        -- `norow` verifica che il blocco NON abbia inserito nulla: uno stato
        -- 'full' che lasciasse una riga sarebbe il peggiore dei mondi.
        v_got := v_status || '/' || COALESCE(v_reason, '-') || '/'
               || CASE WHEN v_res_id IS NULL THEN 'norow' ELSE 'row' END;

        INSERT INTO _esiti VALUES (
            v_ordine, r.caso, r.atteso, v_got,
            CASE WHEN v_got = r.atteso THEN 'OK' ELSE 'FALLITO' END
        );
    END LOOP;

    -- ═══ caso k — il canale manuale non e' mai bloccato dal pacing ═════════
    -- L'admin non passa dalla RPC: `createReservation` fa INSERT diretto.
    -- Qui si riproduce quel percorso con il tetto gia' saturo. Se un domani
    -- qualcuno spostasse il gate in un trigger, questo caso lo intercetta.
    v_ordine := v_ordine + 1;

    DELETE FROM public.reservations
    WHERE activity_id = v_activity_id
      AND reservation_date BETWEEN c_date - 1 AND c_date + 1;

    UPDATE public.activities
    SET reservation_capacity             = NULL,
        reservation_duration_minutes     = 120,
        reservation_confirmation_mode    = 'manuale',
        reservation_overbooking_form     = 'hard',
        reservation_pacing_slot_minutes  = 15,
        reservation_pacing_max_covers    = 2,
        reservation_pacing_max_bookings  = 1
    WHERE id = v_activity_id;

    INSERT INTO public.reservations
        (tenant_id, activity_id, reservation_date, reservation_time,
         party_size, customer_name, customer_email, customer_phone,
         status, source)
    VALUES
        (v_tenant_id, v_activity_id, c_date, TIME '20:00', 8,
         'Ospite al telefono', c_email, '+390000000000', 'confirmed', 'manual')
    RETURNING id INTO v_res_id;

    INSERT INTO _esiti VALUES (
        v_ordine,
        'k — canale manuale sopra il tetto: mai bloccato',
        'inserito',
        CASE WHEN v_res_id IS NOT NULL THEN 'inserito' ELSE 'bloccato' END,
        CASE WHEN v_res_id IS NOT NULL THEN 'OK' ELSE 'FALLITO' END
    );
END;
$$;

-- Formato di `ottenuto`: status/reason/row|norow — `-` per reason NULL,
-- `norow` quando la RPC non ha inserito nulla.
SELECT ordine, caso, atteso, ottenuto, verdetto
FROM _esiti
ORDER BY ordine;

SELECT
    count(*) FILTER (WHERE verdetto = 'OK')      AS ok,
    count(*) FILTER (WHERE verdetto = 'FALLITO') AS falliti
FROM _esiti;

ROLLBACK;
