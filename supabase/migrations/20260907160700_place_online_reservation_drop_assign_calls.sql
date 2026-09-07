-- =========================================
-- RESERVATIONS — Assegnazione tavoli (FASE 3): la RPC non chiama più il motore
-- =========================================
-- Riparte dal corpo di 20260907150500 e toglie UNA sola cosa: i due blocchi
-- BEGIN ... EXCEPTION che chiamavano `assign_tables_for_reservation` dopo
-- gli INSERT. Da 20260907160500 l'assegnazione è un trigger AFTER INSERT su
-- `reservations` (`reservations_assign_tables`): scatta anche per l'INSERT
-- eseguito qui dentro, quindi la chiamata esplicita sarebbe una seconda
-- corsa del motore sulla stessa riga — innocua (cancella e riscrive le stesse
-- righe 'system') ma inutile, e un secondo posto da tenere allineato.
--
-- Questo file va applicato DOPO 20260907160500: fra i due non deve esistere
-- una finestra in cui nessuno assegna.
--
-- ── CONTRATTO INVARIATO ─────────────────────────────────────────────────────
-- Stessa firma, stessa RETURNS TABLE, stessi valori: nessun consumatore
-- (`submit-reservation`) si accorge di niente. `CREATE OR REPLACE` sulla
-- firma identica preserva i grant (REVOKE 20260831150002, GRANT ...150003).
-- Il corpo torna byte-identico a 20260901100003, salvo i commenti.
--
-- ── LOCK ────────────────────────────────────────────────────────────────────
-- Invariato: preso qui prima di pacing e capienza, tenuto fino al commit. Il
-- trigger, dentro l'INSERT, riacquisisce la stessa chiave (re-entrant): la
-- sezione critica include ancora l'assegnazione, come in FASE 2.
--
-- ── ERRORI DEL MOTORE ───────────────────────────────────────────────────────
-- La rete di sicurezza vive nel trigger (`reservations_assign_tables`,
-- 20260907160000): BEGIN ... EXCEPTION WHEN OTHERS → RAISE WARNING con
-- SQLSTATE + SQLERRM, sottotransazione annullata, INSERT intatto. Un errore
-- del motore degrada a prenotazione senza tavolo, mai a submit fallito. Qui
-- non c'è più nulla da proteggere.

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
    --    E l'assegnazione tavoli eseguita dal trigger AFTER INSERT.
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
