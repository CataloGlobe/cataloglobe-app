-- =========================================
-- RESERVATIONS — Assegnazione tavoli (6/7): innesto nel canale online
-- =========================================
-- Riparte dal corpo vigente di 20260901100003 e aggiunge UNA sola cosa: la
-- chiamata a `assign_tables_for_reservation` subito dopo ogni INSERT che
-- produce una prenotazione accettata (ramo capienza NULL e ramo finale).
--
-- ── CONTRATTO INVARIATO ─────────────────────────────────────────────────────
-- Stessa firma, stessa RETURNS TABLE, stessi valori: nessun consumatore
-- (`submit-reservation`) si accorge di niente. `CREATE OR REPLACE` sulla
-- firma identica preserva i grant (REVOKE 20260831150002, GRANT ...150003).
--
-- ── L'ASSEGNAZIONE NON BLOCCA MAI ───────────────────────────────────────────
-- Il risultato del motore viene ignorato (PERFORM). Se non trova tavolo, la
-- prenotazione resta valida e senza tavolo. Nessun `full`, nessuna eccezione,
-- nessun cambio di status. I rami che ritornano `full` (pacing, capienza
-- hard) NON chiamano il motore: non c'è nulla da assegnare.
--
-- ── LOCK ────────────────────────────────────────────────────────────────────
-- Il motore prende lo stesso advisory lock già tenuto qui: re-entrant, nessun
-- deadlock. Il perimetro della sezione critica si allunga di una lettura su
-- `tables`/`reservation_tables` e di 1-3 INSERT; il pacing è già stato
-- valutato prima e non ne è toccato.
--
-- ── ERRORI DEL MOTORE ───────────────────────────────────────────────────────
-- Il motore non solleva eccezioni per esito negativo (ritorna reason). Un
-- errore IMPREVISTO (bug SQL, vincolo violato) NON deve mai far fallire la
-- creazione della prenotazione: ogni PERFORM è avvolta in un blocco
-- BEGIN ... EXCEPTION WHEN OTHERS che registra SQLSTATE + SQLERRM con RAISE
-- WARNING e prosegue.
--
-- Il blocco EXCEPTION di plpgsql apre una sottotransazione (savepoint
-- implicito): all'errore viene annullato SOLO ciò che è stato fatto dentro il
-- blocco (le eventuali righe di `reservation_tables`), mentre l'INSERT su
-- `reservations` sta PRIMA del blocco e resta valido. La prenotazione entra
-- senza tavolo, esattamente come per `no_table_available`.
--
-- Il lock advisory è già tenuto dal corpo esterno prima del blocco: la
-- riacquisizione re-entrant dentro il motore, annullata col savepoint, non
-- rilascia la presa esterna. La serializzazione dei submit è invariata.
--
-- Dentro `assign_tables_for_reservation` gli errori restano visibili: la
-- rete di sicurezza vive SOLO qui, nel chiamante del canale online.

CREATE OR REPLACE FUNCTION public.place_online_reservation(
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
    v_pacing_block        text;
    v_peak                int;
    v_status              text;
    v_inserted_id         uuid;
BEGIN
    -- 1. Lock per activity. Stesso hash per ogni submit concorrente su questa
    --    sede → serializzati. Rilasciato al commit. Copre capienza E pacing
    --    E assegnazione tavoli.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || p_activity_id::text, 0)
    );

    -- 2. Config sede + tenant. Letta UNA volta e passata agli helper.
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

    -- 3. Gate di pacing. Sopra l'early-return su capienza NULL: una sede può
    --    voler limitare gli arrivi senza aver mai configurato una capienza.
    v_pacing_block := public.reservation_pacing_block(
        p_activity_id, p_reservation_date, p_reservation_time, p_party_size,
        v_pace_step, v_pace_max_covers, v_pace_max_bookings
    );
    IF v_pacing_block IS NOT NULL THEN
        reservation_id := NULL;
        status         := 'full';
        -- NULL: il picco è l'output del motore di capienza, che su questo ramo
        -- non viene eseguito. Meglio "non calcolato" di uno zero che sembra un dato.
        peak           := NULL;
        capacity       := v_capacity;
        reason         := v_pacing_block;
        RETURN NEXT;
        RETURN;
    END IF;

    -- 4. Nessuna capienza configurata → nessun gate, insert pending (V0).
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

        -- Assegnazione tavoli: esito ignorato, errori imprevisti assorbiti.
        -- Sottotransazione: l'INSERT sopra resta valido in ogni caso.
        BEGIN
            PERFORM public.assign_tables_for_reservation(v_inserted_id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'assign_tables_for_reservation fallita per prenotazione %, prenotazione creata senza tavolo',
                v_inserted_id
                USING DETAIL = 'SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
        END;

        reservation_id := v_inserted_id;
        status         := 'pending';
        peak           := NULL;
        capacity       := NULL;
        reason         := NULL;
        RETURN NEXT;
        RETURN;
    END IF;

    -- 5. Picco concorrente incluso il candidato.
    v_peak := public.reservation_peak_with_candidate(
        p_activity_id, p_reservation_date, p_reservation_time, p_party_size,
        v_duration_minutes
    );

    -- 6. Matrice decisionale.
    IF v_peak > v_capacity THEN
        IF v_overbooking_form = 'hard' THEN
            v_status := 'full';
        ELSE
            -- soft: insert pending a prescindere da confirmation_mode.
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

    -- 7. Insert con lo status risolto.
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

    -- 8. Assegnazione tavoli: esito ignorato, errori imprevisti assorbiti.
    --    Sottotransazione: l'INSERT sopra resta valido in ogni caso.
    BEGIN
        PERFORM public.assign_tables_for_reservation(v_inserted_id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'assign_tables_for_reservation fallita per prenotazione %, prenotazione creata senza tavolo',
            v_inserted_id
            USING DETAIL = 'SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END;

    reservation_id := v_inserted_id;
    status         := v_status;
    peak           := v_peak;
    capacity       := v_capacity;
    reason         := NULL;
    RETURN NEXT;
END;
$$;
