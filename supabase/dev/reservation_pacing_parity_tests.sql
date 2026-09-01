-- =============================================================================
-- CataloGlobe V2 — Parita' di `place_online_reservation` prima/dopo il pacing
--
-- NON e' una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── A COSA SERVE ────────────────────────────────────────────────────────────
-- Il pacing entra DENTRO `place_online_reservation`, sotto lo stesso
-- pg_advisory_xact_lock della capienza (il lock e' transaction-scoped: due RPC
-- separate non possono condividerlo, quindi non esiste un fuori corretto).
-- Toccare quella funzione significa rischiare di muovere il comportamento
-- attuale. Questo script congela il comportamento attuale in una copia di
-- riferimento (`place_online_reservation_v1_ref`) e confronta le due funzioni
-- caso per caso, con i tetti di pacing a NULL.
--
-- Con entrambi i tetti NULL il verdetto atteso e' PARITA' su ogni riga.
--
-- ── QUANDO ESEGUIRLO ────────────────────────────────────────────────────────
-- 1. PRIMA di applicare la RPC nuova → tutte le righe devono dare PARITA'.
--    E' il collaudo dell'attrezzo: confronta la funzione con una sua copia,
--    quindi qualunque MISMATCH qui e' un bug dello script, non del motore.
-- 2. DOPO aver applicato la RPC nuova → stesse righe, stesso verdetto.
--    Un MISMATCH qui e' una regressione vera.
--
-- Le colonne di pacing (migration 20260831140000) possono esserci o no: se ci
-- sono vengono forzate a NULL a ogni caso, se non ci sono il blocco e' saltato.
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. NON su produzione.
--
-- NON e' eseguibile via MCP: quella connessione e' in transazione read-only e
-- questo script scrive (poi annulla tutto). Serve una sessione normale.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- Tutto dentro un unico BEGIN … ROLLBACK: nessuna riga sopravvive, la funzione
-- di riferimento sparisce, la configurazione della sede di prova torna com'era
-- (il ROLLBACK annulla anche le UPDATE su `activities`).
-- Se interrompi a meta', esegui `ROLLBACK;` a mano prima di altro.
--
-- Gira come `postgres`, quindi RLS non e' in mezzo: qui si verifica il motore,
-- non le policy. Le prenotazioni di prova stanno nel 2099, fuori da qualunque
-- dato reale.
-- =============================================================================

BEGIN;

-- ── Copia di riferimento: il corpo ATTUALE, verbatim ────────────────────────
-- SECURITY INVOKER (giriamo come postgres, non serve il definer) e nessun
-- GRANT: questa funzione vive solo dentro la transazione.
CREATE FUNCTION public.place_online_reservation_v1_ref(
    p_activity_id      uuid,
    p_reservation_date date,
    p_reservation_time time,
    p_party_size       int,
    p_customer_name    text,
    p_customer_email   text,
    p_customer_phone   text,
    p_notes            text,
    p_source           text DEFAULT 'online'
)
RETURNS TABLE (
    reservation_id uuid,
    status         text,
    peak           int,
    capacity       int
)
LANGUAGE plpgsql
SET search_path TO ''
AS $ref$
DECLARE
    v_tenant_id           uuid;
    v_capacity            int;
    v_duration_minutes    int;
    v_confirmation_mode   text;
    v_overbooking_form    text;
    v_cand_start_min      int;
    v_cand_end_min        int;
    v_event_t             int;
    v_event_delta         int;
    v_event_order         int;
    v_level               int;
    v_peak                int;
    v_baseline_locked     bool;
    v_status              text;
    v_inserted_id         uuid;
BEGIN
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || p_activity_id::text, 0)
    );

    SELECT
        a.tenant_id,
        a.reservation_capacity,
        a.reservation_duration_minutes,
        a.reservation_confirmation_mode,
        a.reservation_overbooking_form
    INTO
        v_tenant_id,
        v_capacity,
        v_duration_minutes,
        v_confirmation_mode,
        v_overbooking_form
    FROM public.activities a
    WHERE a.id = p_activity_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'activity_not_found' USING ERRCODE = 'P0001';
    END IF;

    IF v_capacity IS NULL THEN
        INSERT INTO public.reservations (
            tenant_id, activity_id,
            reservation_date, reservation_time, party_size,
            customer_name, customer_email, customer_phone, notes,
            status, source
        ) VALUES (
            v_tenant_id, p_activity_id,
            p_reservation_date, p_reservation_time, p_party_size,
            p_customer_name, p_customer_email, p_customer_phone, p_notes,
            'pending', COALESCE(p_source, 'online')
        )
        RETURNING id INTO v_inserted_id;

        reservation_id := v_inserted_id;
        status         := 'pending';
        peak           := NULL;
        capacity       := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    v_cand_start_min := EXTRACT(HOUR FROM p_reservation_time)::int * 60
                      + EXTRACT(MINUTE FROM p_reservation_time)::int;
    v_cand_end_min   := v_cand_start_min + v_duration_minutes;

    v_level := 0;
    v_peak := 0;
    v_baseline_locked := false;

    FOR v_event_t, v_event_delta, v_event_order IN
        WITH rows AS (
            SELECT
                r.id,
                r.reservation_date,
                r.reservation_time,
                r.party_size,
                r.status
            FROM public.reservations r
            WHERE r.activity_id = p_activity_id
              AND r.status IN ('pending','confirmed')
              AND r.reservation_date BETWEEN
                  p_reservation_date - 1 AND p_reservation_date + 1
              AND r.party_size > 0
            UNION ALL
            SELECT
                NULL::uuid,
                p_reservation_date,
                p_reservation_time,
                p_party_size,
                'pending'::text
        ),
        evt AS (
            SELECT
                ((r.reservation_date - p_reservation_date) * 1440
                 + EXTRACT(HOUR FROM r.reservation_time)::int * 60
                 + EXTRACT(MINUTE FROM r.reservation_time)::int)::int AS t,
                r.party_size::int AS delta,
                0::int AS ord
            FROM rows r
            UNION ALL
            SELECT
                ((r.reservation_date - p_reservation_date) * 1440
                 + EXTRACT(HOUR FROM r.reservation_time)::int * 60
                 + EXTRACT(MINUTE FROM r.reservation_time)::int
                 + v_duration_minutes)::int AS t,
                (-r.party_size)::int AS delta,
                1::int AS ord
            FROM rows r
        )
        SELECT t, delta, ord FROM evt
        ORDER BY t ASC, ord DESC
    LOOP
        IF v_event_t < v_cand_start_min THEN
            v_level := v_level + v_event_delta;
            CONTINUE;
        END IF;
        IF v_event_t = v_cand_start_min AND v_event_order = 1 THEN
            v_level := v_level + v_event_delta;
            CONTINUE;
        END IF;
        IF NOT v_baseline_locked THEN
            v_peak := v_level;
            v_baseline_locked := true;
        END IF;
        IF v_event_t >= v_cand_end_min THEN
            EXIT;
        END IF;
        v_level := v_level + v_event_delta;
        IF v_level > v_peak THEN
            v_peak := v_level;
        END IF;
    END LOOP;
    IF NOT v_baseline_locked THEN
        v_peak := v_level;
    END IF;
    IF v_peak < 0 THEN
        v_peak := 0;
    END IF;

    IF v_peak > v_capacity THEN
        IF v_overbooking_form = 'hard' THEN
            v_status := 'full';
        ELSE
            v_status := 'pending';
        END IF;
    ELSE
        IF v_confirmation_mode = 'auto' THEN
            v_status := 'confirmed';
        ELSE
            v_status := 'pending';
        END IF;
    END IF;

    IF v_status = 'full' THEN
        reservation_id := NULL;
        status         := 'full';
        peak           := v_peak;
        capacity       := v_capacity;
        RETURN NEXT;
        RETURN;
    END IF;

    INSERT INTO public.reservations (
        tenant_id, activity_id,
        reservation_date, reservation_time, party_size,
        customer_name, customer_email, customer_phone, notes,
        status, source
    ) VALUES (
        v_tenant_id, p_activity_id,
        p_reservation_date, p_reservation_time, p_party_size,
        p_customer_name, p_customer_email, p_customer_phone, p_notes,
        v_status, COALESCE(p_source, 'online')
    )
    RETURNING id INTO v_inserted_id;

    reservation_id := v_inserted_id;
    status         := v_status;
    peak           := v_peak;
    capacity       := v_capacity;
    RETURN NEXT;
END;
$ref$;

CREATE TEMP TABLE _esiti (
    ordine   int,
    caso     text,
    atteso   text,
    nuova    text,
    ref      text,
    verdetto text
);

DO $$
DECLARE
    v_activity_id uuid;
    v_tenant_id   uuid;
    v_has_pacing  bool;

    -- Data di prova nel 2099: nessuna sovrapposizione con dati reali.
    c_date  CONSTANT date := DATE '2099-03-15';

    -- `reservations.customer_email` e' NOT NULL a schema. Il dominio
    -- `.invalid` e' riservato per definizione (RFC 2606): nessun rischio che
    -- una mail parta davvero verso un indirizzo di qualcuno. Qui comunque
    -- non parte nulla: le mail le manda l'Edge function, non la RPC.
    c_email CONSTANT text := 'parita@example.invalid';

    -- Risultati delle due funzioni, proiettati su (status, peak, capacity).
    v_new_id     uuid;
    v_new_status text;
    v_new_peak   int;
    v_new_cap    int;
    v_ref_id     uuid;
    v_ref_status text;
    v_ref_peak   int;
    v_ref_cap    int;

    v_new_txt text;
    v_ref_txt text;
    v_ordine  int := 0;

    -- Matrice dei casi. `seed_*` descrive l'unica prenotazione preesistente
    -- (party 0 = nessun seed). `cand_*` il candidato online.
    r RECORD;
BEGIN
    -- Sede qualsiasi con prenotazioni abilitate E feature di piano attiva:
    -- il trigger BEFORE INSERT `reservations_enforce_feature_table_reservation`
    -- rifiuta le righe su sedi senza la feature, e il suo errore non direbbe
    -- che il problema e' la sede scelta, non lo script.
    SELECT a.id, a.tenant_id INTO v_activity_id, v_tenant_id
    FROM public.activities a
    WHERE a.enable_reservations
      AND public.activity_has_feature(a.id, 'table_reservation')
    ORDER BY a.created_at
    LIMIT 1;

    IF v_activity_id IS NULL THEN
        RAISE EXCEPTION 'Nessuna sede con enable_reservations e feature table_reservation attiva: impossibile testare.';
    END IF;

    -- Le colonne di pacing possono non esistere ancora (script eseguibile
    -- prima della migration). Se ci sono, vanno forzate a NULL: la parita' si
    -- verifica con il pacing disattivato.
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'activities'
          AND column_name = 'reservation_pacing_max_covers'
    ) INTO v_has_pacing;

    IF v_has_pacing THEN
        EXECUTE format(
            'UPDATE public.activities SET
                 reservation_pacing_max_covers = NULL,
                 reservation_pacing_max_bookings = NULL,
                 reservation_pacing_slot_minutes = 15
             WHERE id = %L', v_activity_id);
        RAISE NOTICE 'Colonne di pacing presenti: azzerate per la prova.';
    ELSE
        RAISE NOTICE 'Colonne di pacing assenti: baseline pre-migration.';
    END IF;

    FOR r IN
        SELECT * FROM (VALUES
            -- caso                                        cap   conf      over    seed_off seed_time seed_party seed_status  cand_time cand_party  atteso
            ('a — capienza NULL: nessun gate',              NULL, 'manuale','hard',  0, TIME '19:30',  0, 'confirmed', TIME '20:00', 4, 'pending/-/-'),
            ('b — sotto capienza, manuale',                   20, 'manuale','hard',  0, TIME '19:30',  6, 'confirmed', TIME '20:00', 4, 'pending/10/20'),
            ('c — sopra capienza, hard → full',               20, 'manuale','hard',  0, TIME '19:30', 18, 'confirmed', TIME '20:00', 4, 'full/22/20'),
            ('d — sotto capienza, auto → confirmed',          20, 'auto',   'hard',  0, TIME '19:30',  6, 'confirmed', TIME '20:00', 4, 'confirmed/10/20'),
            ('e — sopra capienza, soft → pending',            20, 'manuale','soft',  0, TIME '19:30', 18, 'confirmed', TIME '20:00', 4, 'pending/22/20'),
            ('f — esattamente al limite → pending',           20, 'manuale','hard',  0, TIME '19:30', 16, 'confirmed', TIME '20:00', 4, 'pending/20/20'),
            ('g — half-open: uscita a candStart non conta',    5, 'manuale','hard',  0, TIME '18:00', 10, 'confirmed', TIME '20:00', 4, 'pending/4/5'),
            ('h — overnight D-1 23:30 vs candidato 00:30',    10, 'manuale','hard', -1, TIME '23:30', 10, 'confirmed', TIME '00:30', 4, 'full/14/10'),
            ('i — riga cancelled ignorata dal motore',        10, 'manuale','hard',  0, TIME '19:30', 20, 'cancelled', TIME '20:00', 4, 'pending/4/10')
        ) AS t(caso, cap, conf, over, seed_off, seed_time, seed_party, seed_status, cand_time, cand_party, atteso)
    LOOP
        v_ordine := v_ordine + 1;

        -- ── Configurazione della sede per il caso ──────────────────────────
        UPDATE public.activities
        SET reservation_capacity          = r.cap,
            reservation_duration_minutes  = 120,
            reservation_confirmation_mode = r.conf,
            reservation_overbooking_form  = r.over
        WHERE id = v_activity_id;

        -- ══ Chiamata 1: funzione in produzione ═════════════════════════════
        DELETE FROM public.reservations
        WHERE activity_id = v_activity_id
          AND reservation_date BETWEEN c_date - 1 AND c_date + 1;

        IF r.seed_party > 0 THEN
            INSERT INTO public.reservations
                (tenant_id, activity_id, reservation_date, reservation_time,
                 party_size, customer_name, customer_email, customer_phone,
                 status, source)
            VALUES
                (v_tenant_id, v_activity_id, c_date + r.seed_off, r.seed_time,
                 r.seed_party, 'Seed parita', c_email, '+390000000000',
                 r.seed_status, 'manual');
        END IF;

        -- Proiezione per NOME colonna: immune all'aggiunta di `reason` nella
        -- signature della funzione nuova.
        SELECT p.reservation_id, p.status, p.peak, p.capacity
        INTO v_new_id, v_new_status, v_new_peak, v_new_cap
        FROM public.place_online_reservation(
            v_activity_id, c_date, r.cand_time, r.cand_party,
            'Parita nuova', c_email, '+390000000001', NULL, 'online'
        ) p;

        -- ══ Chiamata 2: copia di riferimento, stesso stato di partenza ═════
        DELETE FROM public.reservations
        WHERE activity_id = v_activity_id
          AND reservation_date BETWEEN c_date - 1 AND c_date + 1;

        IF r.seed_party > 0 THEN
            INSERT INTO public.reservations
                (tenant_id, activity_id, reservation_date, reservation_time,
                 party_size, customer_name, customer_email, customer_phone,
                 status, source)
            VALUES
                (v_tenant_id, v_activity_id, c_date + r.seed_off, r.seed_time,
                 r.seed_party, 'Seed parita', c_email, '+390000000000',
                 r.seed_status, 'manual');
        END IF;

        SELECT p.reservation_id, p.status, p.peak, p.capacity
        INTO v_ref_id, v_ref_status, v_ref_peak, v_ref_cap
        FROM public.place_online_reservation_v1_ref(
            v_activity_id, c_date, r.cand_time, r.cand_party,
            'Parita ref', c_email, '+390000000001', NULL, 'online'
        ) p;

        v_new_txt := v_new_status || '/' || COALESCE(v_new_peak::text, '-')
                                  || '/' || COALESCE(v_new_cap::text, '-');
        v_ref_txt := v_ref_status || '/' || COALESCE(v_ref_peak::text, '-')
                                  || '/' || COALESCE(v_ref_cap::text, '-');

        INSERT INTO _esiti VALUES (
            v_ordine, r.caso, r.atteso, v_new_txt, v_ref_txt,
            CASE
                WHEN v_new_txt IS DISTINCT FROM v_ref_txt THEN 'MISMATCH'
                WHEN v_new_txt IS DISTINCT FROM r.atteso  THEN 'ATTESO DIVERSO'
                ELSE 'PARITA'
            END
        );

        -- L'INSERT nell'ordine reale non deve inquinare il caso successivo.
        DELETE FROM public.reservations
        WHERE activity_id = v_activity_id
          AND reservation_date BETWEEN c_date - 1 AND c_date + 1;
    END LOOP;
END;
$$;

-- ── Esiti ───────────────────────────────────────────────────────────────────
-- `nuova` = funzione in produzione, `ref` = copia congelata. Formato dei
-- valori: status/peak/capacity, `-` per NULL.
--
-- MISMATCH        → la funzione nuova diverge dalla vecchia: regressione.
-- ATTESO DIVERSO  → le due concordano ma sul valore sbagliato: o e' cambiato
--                   il motore in modo voluto, o l'atteso in tabella e' stale.
SELECT ordine, caso, atteso, nuova, ref, verdetto
FROM _esiti
ORDER BY ordine;

SELECT
    count(*) FILTER (WHERE verdetto = 'PARITA')         AS parita,
    count(*) FILTER (WHERE verdetto = 'MISMATCH')       AS mismatch,
    count(*) FILTER (WHERE verdetto = 'ATTESO DIVERSO') AS atteso_diverso
FROM _esiti;

-- Nessuna riga sopravvive: prenotazioni di prova, funzione di riferimento e
-- configurazione della sede tornano tutte allo stato precedente.
ROLLBACK;
