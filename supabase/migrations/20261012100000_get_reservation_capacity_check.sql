-- =============================================================================
-- get_reservation_capacity_check — i numeri della capienza per il back office
-- =============================================================================
-- L'avviso di overbooking del form (`ReservationForm`) e il callout di
-- capienza del drawer (`ReservationDetailDrawer`) calcolavano il picco dalle
-- prenotazioni che la pagina ha in memoria: se la finestra caricata non
-- contiene il giorno giusto (D-1..D+1), l'avviso diventa cieco in silenzio.
-- Per le prenotazioni manuali è l'UNICO controllo di capienza
-- (`createReservation` è un INSERT diretto). Da qui il client chiede i numeri
-- al server; il calcolo in memoria resta come ripiego se la RPC non risponde.
--
-- Restituisce numeri, non un sì/no: il back office mostra DI QUANTO si sfora.
-- Non blocca niente (il ristoratore può sempre salvare).
--
-- ⚠️ SYNC con `reservation_peak_with_candidate` (20260917100000) per il picco
-- e con `reservation_pacing_block` (20260917100100) per la fascia: stessi
-- stati (pending, confirmed, seated), stessa finestra D-1..D+1, stesso sweep
-- (a parità di minuto prima le uscite), stessa fascia `minuti / passo`. In più
-- `p_exclude_reservation_id`: in modifica la prenotazione stessa non si conta
-- due volte (le due funzioni sopra non lo sanno fare, servono solo online).
--
-- Permesso: `reservations.read` sulla sede, lo stesso della policy di lettura
-- di `reservations`. Chi non lo ha riceve 42501.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_reservation_capacity_check(
    p_activity_id            uuid,
    p_reservation_date       date,
    p_reservation_time       time,
    p_party_size             int,
    p_exclude_reservation_id uuid DEFAULT NULL
)
RETURNS TABLE (
    capacity               int,
    duration_minutes       int,
    peak_with_candidate    int,
    pacing_slot_minutes    int,
    pacing_max_covers      int,
    pacing_max_bookings    int,
    pacing_bucket_covers   int,
    pacing_bucket_bookings int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_capacity        int;
    v_duration        int;
    v_slot            int;
    v_max_covers      int;
    v_max_bookings    int;
    v_cand_start_min  int;
    v_cand_end_min    int;
    v_event_t         int;
    v_event_delta     int;
    v_event_order     int;
    v_level           int := 0;
    v_peak            int := 0;
    v_baseline_locked bool := false;
    v_bucket_index    int;
    v_bucket_covers   int := 0;
    v_bucket_bookings int := 0;
BEGIN
    IF p_activity_id IS NULL OR p_reservation_date IS NULL OR p_reservation_time IS NULL THEN
        RAISE EXCEPTION 'get_reservation_capacity_check: parametri mancanti'
            USING ERRCODE = '22023';
    END IF;
    IF p_party_size IS NULL OR p_party_size <= 0 THEN
        RAISE EXCEPTION 'get_reservation_capacity_check: numero di persone non valido (%)', p_party_size
            USING ERRCODE = '22023';
    END IF;

    IF NOT public.has_permission('reservations.read', p_activity_id) THEN
        RAISE EXCEPTION 'get_reservation_capacity_check: sede non autorizzata'
            USING ERRCODE = '42501';
    END IF;

    SELECT a.reservation_capacity,
           COALESCE(a.reservation_duration_minutes, 120),
           COALESCE(a.reservation_pacing_slot_minutes, 15),
           a.reservation_pacing_max_covers,
           a.reservation_pacing_max_bookings
      INTO v_capacity, v_duration, v_slot, v_max_covers, v_max_bookings
      FROM public.activities a
     WHERE a.id = p_activity_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'get_reservation_capacity_check: sede non autorizzata'
            USING ERRCODE = '42501';
    END IF;

    -- ── Picco nella finestra [inizio, inizio + durata) ─────────────────────
    v_cand_start_min := EXTRACT(HOUR FROM p_reservation_time)::int * 60
                      + EXTRACT(MINUTE FROM p_reservation_time)::int;
    v_cand_end_min   := v_cand_start_min + v_duration;

    FOR v_event_t, v_event_delta, v_event_order IN
        WITH rows AS (
            SELECT r.reservation_date, r.reservation_time, r.party_size
              FROM public.reservations r
             WHERE r.activity_id = p_activity_id
               AND r.status IN ('pending','confirmed','seated')
               AND r.reservation_date BETWEEN p_reservation_date - 1 AND p_reservation_date + 1
               AND r.party_size > 0
               AND (p_exclude_reservation_id IS NULL OR r.id <> p_exclude_reservation_id)
            UNION ALL
            SELECT p_reservation_date, p_reservation_time, p_party_size
        ),
        evt AS (
            SELECT ((r.reservation_date - p_reservation_date) * 1440
                    + EXTRACT(HOUR FROM r.reservation_time)::int * 60
                    + EXTRACT(MINUTE FROM r.reservation_time)::int)::int AS t,
                   r.party_size::int AS delta,
                   0::int AS ord
              FROM rows r
            UNION ALL
            SELECT ((r.reservation_date - p_reservation_date) * 1440
                    + EXTRACT(HOUR FROM r.reservation_time)::int * 60
                    + EXTRACT(MINUTE FROM r.reservation_time)::int
                    + v_duration)::int AS t,
                   (-r.party_size)::int AS delta,
                   1::int AS ord
              FROM rows r
        )
        SELECT t, delta, ord FROM evt ORDER BY t ASC, ord DESC
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

    -- ── Fascia del pacing (solo gli arrivi, stessa data) ───────────────────
    IF v_slot > 0 AND (v_max_covers IS NOT NULL OR v_max_bookings IS NOT NULL) THEN
        v_bucket_index := v_cand_start_min / v_slot;
        SELECT COALESCE(SUM(r.party_size), 0)::int, COUNT(*)::int
          INTO v_bucket_covers, v_bucket_bookings
          FROM public.reservations r
         WHERE r.activity_id = p_activity_id
           AND r.reservation_date = p_reservation_date
           AND r.status IN ('pending','confirmed','seated')
           AND r.party_size > 0
           AND (p_exclude_reservation_id IS NULL OR r.id <> p_exclude_reservation_id)
           AND ((EXTRACT(HOUR FROM r.reservation_time)::int * 60
               + EXTRACT(MINUTE FROM r.reservation_time)::int) / v_slot) = v_bucket_index;
    END IF;

    RETURN QUERY SELECT v_capacity, v_duration, v_peak, v_slot, v_max_covers,
                        v_max_bookings, v_bucket_covers, v_bucket_bookings;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reservation_capacity_check(uuid, date, time, int, uuid)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reservation_capacity_check(uuid, date, time, int, uuid)
    TO authenticated;
