-- =========================================
-- RESERVATIONS — Estrazione (4/7): la RPC adotta gli helper
-- =========================================
-- Stessa firma, stessa RETURNS TABLE, stessa matrice decisionale, stesso
-- INSERT. Cambia SOLO da dove arrivano i due verdetti: pacing e picco non sono
-- più inline ma chiamate a `reservation_pacing_block` e
-- `reservation_peak_with_candidate`.
--
-- `CREATE OR REPLACE` sulla firma identica PRESERVA i grant esistenti: niente
-- file REVOKE/GRANT di accompagnamento (li servirebbe solo un DROP+CREATE).
--
-- ── IL LOCK NON SI MUOVE ────────────────────────────────────────────────────
-- `pg_advisory_xact_lock` resta qui, preso PRIMA di entrambe le chiamate e
-- tenuto fino al commit. Gli helper sono di sola lettura e senza lock proprio:
-- se lo prendessero loro, durerebbe quanto la funzione e non quanto la
-- transazione, e due submit simultanei tornerebbero a superarsi a vicenda.
-- La garanzia di concorrenza è invariata perché il perimetro del lock è
-- invariato.
--
-- ── PARITÀ ──────────────────────────────────────────────────────────────────
-- Da dimostrare con `supabase/dev/reservation_pacing_parity_tests.sql` (che
-- confronta questa funzione con una copia congelata della v1 pre-pacing) e con
-- `reservation_pacing_engine_tests.sql` (11 casi di comportamento del pacing).
-- Entrambi vanno rilanciati DOPO questa migration: un solo verdetto diverso
-- significa che l'estrazione ha spostato il comportamento.

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
    --    sede → serializzati. Rilasciato al commit. Copre capienza E pacing.
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

    reservation_id := v_inserted_id;
    status         := v_status;
    peak           := v_peak;
    capacity       := v_capacity;
    reason         := NULL;
    RETURN NEXT;
END;
$$;
