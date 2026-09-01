-- =========================================
-- RESERVATIONS — Pacing (2/4): la funzione v2
-- =========================================
-- Aggiunge il gate di pacing e la colonna OUT `reason`. Il motore di capienza
-- (sweep-line, half-open, asse ±1440) e' INVARIATO: rispetto alla v1 cambiano
-- solo il blocco di pacing nuovo e l'assegnazione di `reason` sui rami di
-- uscita gia' esistenti.
--
-- ── PERCHE' QUI DENTRO ──────────────────────────────────────────────────────
-- Il pacing ha lo stesso problema di concorrenza della capienza: due richieste
-- simultanee sulla stessa fascia devono vedersi a vicenda. `pg_advisory_xact_lock`
-- e' transaction-scoped e ogni chiamata RPC via PostgREST e' una transazione a
-- se': due RPC separate (una "controlla", una "inserisci") NON possono
-- condividere il lock → TOCTOU, bug raro e non riproducibile. Non esiste un
-- fuori corretto. Il gate vive qui, sotto il lock che gia' c'e'.
--
-- ── ORDINE DEI CONTROLLI ────────────────────────────────────────────────────
-- Il pacing sta SOPRA l'early-return su `reservation_capacity IS NULL`: una
-- sede puo' voler limitare gli arrivi senza aver mai configurato una capienza.
-- Sono due domande diverse — quante persone stanno nel locale, quante ne
-- possono arrivare insieme — e nessuna delle due presuppone l'altra.
--
-- ── COMPORTAMENTO INVARIATO ─────────────────────────────────────────────────
-- Guardia esplicita: con entrambi i tetti NULL non si esegue nessuna query
-- aggiuntiva e il flusso e' identico alla v1. Verificato dallo script
-- `supabase/dev/reservation_pacing_parity_tests.sql`, che confronta questa
-- funzione con una copia congelata della v1 su nove casi.
--
-- ── IL CANALE MANUALE ───────────────────────────────────────────────────────
-- Non passa di qui: l'inserimento admin fa INSERT diretto via `createReservation`.
-- L'invariante "il pacing chiude il canale online, mai l'operatore" e' quindi
-- garantito per costruzione, non da un flag che qualcuno potrebbe dimenticare.
--
-- ── IL PACING NON GUARDA `reservation_overbooking_form` ─────────────────────
-- Quel campo governa l'overbooking di CAPIENZA (hard blocca, soft accetta in
-- pending). Il pacing e' un tetto sul ritmo degli arrivi: superarlo di
-- nascosto non produce una sala piu' piena, produce quattro tavoli che entrano
-- insieme. Online quindi blocca sempre; chi vuole sforare lo fa consapevolmente
-- dalla dashboard.
--
-- ── `reason` ────────────────────────────────────────────────────────────────
-- NULL quando lo status non e' 'full'. Altrimenti:
--   'capacity'        — capienza superata, overbooking hard
--   'pacing_covers'   — tetto di COPERTI della fascia superato
--   'pacing_bookings' — tetto di PRENOTAZIONI della fascia superato
-- Le due leve di pacing sono indipendenti per progetto (quattro tavoli da 2 e
-- un tavolo da 8 fanno gli stessi coperti ma un carico di sala diverso), quindi
-- il motivo le distingue anche se il messaggio al cliente sara' lo stesso.
-- Chi legge non e' obbligato a distinguerle, ma se un domani serve l'informazione
-- c'e' invece di essere stata buttata.
--
-- ── `peak` sul ramo pacing ──────────────────────────────────────────────────
-- NULL: il picco di occupazione e' l'output del motore di capienza, che su
-- questo ramo non e' stato eseguito. Meglio dichiarare "non calcolato" che
-- restituire uno zero che sembra un dato.

CREATE FUNCTION public.place_online_reservation(
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
    capacity       int,
    reason         text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id           uuid;
    v_capacity            int;
    v_duration_minutes    int;
    v_confirmation_mode   text;
    v_overbooking_form    text;
    v_pace_step           int;
    v_pace_max_covers     int;
    v_pace_max_bookings   int;
    v_bucket_index        int;
    v_bucket_covers       int;
    v_bucket_bookings     int;
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
    -- 1. Lock per activity. Same hash for every concurrent submit on this
    --    activity → serialized. Released at commit. Copre capienza E pacing.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || p_activity_id::text, 0)
    );

    -- 2. Activity config + tenant.
    SELECT
        a.tenant_id,
        a.reservation_capacity,
        a.reservation_duration_minutes,
        a.reservation_confirmation_mode,
        a.reservation_overbooking_form,
        a.reservation_pacing_slot_minutes,
        a.reservation_pacing_max_covers,
        a.reservation_pacing_max_bookings
    INTO
        v_tenant_id,
        v_capacity,
        v_duration_minutes,
        v_confirmation_mode,
        v_overbooking_form,
        v_pace_step,
        v_pace_max_covers,
        v_pace_max_bookings
    FROM public.activities a
    WHERE a.id = p_activity_id;

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION 'activity_not_found' USING ERRCODE = 'P0001';
    END IF;

    -- 3. Gate di pacing — tetto sugli ARRIVI nella fascia.
    --
    --    Diverso dalla capienza: qui non c'e' nessuna permanenza da modellare.
    --    Una prenotazione delle 20:00 pesa sulla fascia delle 20:00 e basta,
    --    non su quelle successive. Niente sweep-line, una sola aggregazione.
    --
    --    Con entrambi i tetti NULL non si entra nemmeno: nessuna query, flusso
    --    identico alla v1.
    IF v_pace_max_covers IS NOT NULL OR v_pace_max_bookings IS NOT NULL THEN
        -- Bucket = indice della fascia dalla mezzanotte di reservation_date.
        -- Divisione intera fra non-negativi → floor. Il passo e' NOT NULL con
        -- CHECK IN (15,30,60), quindi mai zero.
        v_bucket_index := (EXTRACT(HOUR FROM p_reservation_time)::int * 60
                         + EXTRACT(MINUTE FROM p_reservation_time)::int)
                         / v_pace_step;

        -- Solo la stessa data di calendario: gli arrivi sono ancorati alla
        -- loro data cosi' come sono memorizzati (colonne separate date/time).
        -- Le code oltre la mezzanotte appartengono al giorno successivo, che
        -- e' anche il modo in cui il form pubblico le offre.
        --
        -- Copertura indice: idx_reservations_activity_date_active su
        -- (activity_id, reservation_date) parziale sugli stati attivi.
        SELECT COALESCE(SUM(r.party_size), 0), COUNT(*)
        INTO v_bucket_covers, v_bucket_bookings
        FROM public.reservations r
        WHERE r.activity_id = p_activity_id
          AND r.reservation_date = p_reservation_date
          AND r.status IN ('pending','confirmed')
          AND r.party_size > 0
          AND ((EXTRACT(HOUR FROM r.reservation_time)::int * 60
              + EXTRACT(MINUTE FROM r.reservation_time)::int) / v_pace_step)
              = v_bucket_index;

        -- Il candidato non e' ancora inserito: va sommato a mano. Si applica
        -- il piu' restrittivo dei due tetti — il primo che scatta chiude.
        IF v_pace_max_covers IS NOT NULL
           AND v_bucket_covers + p_party_size > v_pace_max_covers THEN
            reservation_id := NULL;
            status         := 'full';
            peak           := NULL;
            capacity       := v_capacity;
            reason         := 'pacing_covers';
            RETURN NEXT;
            RETURN;
        END IF;

        IF v_pace_max_bookings IS NOT NULL
           AND v_bucket_bookings + 1 > v_pace_max_bookings THEN
            reservation_id := NULL;
            status         := 'full';
            peak           := NULL;
            capacity       := v_capacity;
            reason         := 'pacing_bookings';
            RETURN NEXT;
            RETURN;
        END IF;
    END IF;

    -- 4. No capacity configured → no gate, pending insert (V0 behavior).
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
        reason         := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- 5. Compute peak concurrent including candidate.
    --    Relative-minute axis: candidate's date = 0, neighbours = ±1440.
    --    Events come from candidate + all non-terminal rows on ±1 days.
    v_cand_start_min := EXTRACT(HOUR FROM p_reservation_time)::int * 60
                      + EXTRACT(MINUTE FROM p_reservation_time)::int;
    v_cand_end_min   := v_cand_start_min + v_duration_minutes;

    -- Build the event stream as a CTE-driven query. Half-open semantics
    -- delivered by the (t, order) sort: at equal t, order=1 (departures)
    -- comes BEFORE order=0 (arrivals).
    --
    -- Day offset → minutes:
    --   r.reservation_date - p_reservation_date IN (-1, 0, +1) maps to
    --   (-1440, 0, +1440). Rows outside that band are filtered out by the
    --   WHERE clause.
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
            -- Synthetic candidate row. The candidate is included so the peak
            -- captures the post-insert state.
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
            -- Departure exactly at candStart belongs to baseline (half-open).
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
    -- No in-window event → baseline IS the peak.
    IF NOT v_baseline_locked THEN
        v_peak := v_level;
    END IF;
    IF v_peak < 0 THEN
        v_peak := 0;
    END IF;

    -- 6. Decision matrix.
    IF v_peak > v_capacity THEN
        IF v_overbooking_form = 'hard' THEN
            v_status := 'full';
        ELSE
            -- soft: insert as pending regardless of confirmation_mode.
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
        reason         := 'capacity';
        RETURN NEXT;
        RETURN;
    END IF;

    -- 7. Insert with the resolved status.
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
    reason         := NULL;
    RETURN NEXT;
END;
$$;
