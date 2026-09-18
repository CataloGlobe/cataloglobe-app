-- =========================================
-- RESERVATIONS — FASE 5.1 (1/4): `seated` occupa capienza
-- =========================================
-- Da quando il gesto «Arrivato» scrive `seated` (BLOCCO 2,
-- open_seating_for_reservation, 20260911130000), il filtro a due stati di
-- questa funzione era sbagliato: appena la comitiva si siede, i suoi coperti
-- uscivano dal picco e una richiesta online nella stessa finestra passava
-- sotto una capienza che in sala era già piena.
--
-- Regola: una prenotazione occupa capienza finché è attesa o presente.
--   occupano:     pending, confirmed, seated
--   non occupano: completed, no_show, cancelled, declined
-- `completed` non occupa perché chi ha finito ha liberato il tavolo davvero:
-- la realtà batte la durata pianificata.
--
-- Corpo identico a 20260901100000 salvo la lista degli stati. Stessa lista
-- in reservation_pacing_block (2/4) e nell'indice parziale
-- idx_reservations_activity_date_active (3/4, 4/4). Il frontend replica la
-- terna in src/utils/reservationCapacity.ts (occupiesCapacity) per l'avviso
-- non bloccante del pannello: se cambia qui, va cambiata anche lì.
--
-- CREATE OR REPLACE conserva i grant esistenti: nessun REVOKE/GRANT qui.

CREATE OR REPLACE FUNCTION public.reservation_peak_with_candidate(
    p_activity_id      uuid,
    p_reservation_date date,
    p_reservation_time time,
    p_party_size       int,
    p_duration_minutes int
)
RETURNS int
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_cand_start_min  int;
    v_cand_end_min    int;
    v_event_t         int;
    v_event_delta     int;
    v_event_order     int;
    v_level           int;
    v_peak            int;
    v_baseline_locked bool;
BEGIN
    v_cand_start_min := EXTRACT(HOUR FROM p_reservation_time)::int * 60
                      + EXTRACT(MINUTE FROM p_reservation_time)::int;
    v_cand_end_min   := v_cand_start_min + p_duration_minutes;

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
              AND r.status IN ('pending','confirmed','seated')
              AND r.reservation_date BETWEEN
                  p_reservation_date - 1 AND p_reservation_date + 1
              AND r.party_size > 0
            UNION ALL
            -- Riga sintetica del candidato: il picco deve riflettere lo stato
            -- POST-inserimento, non quello attuale.
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
                 + p_duration_minutes)::int AS t,
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
            -- Uscita esattamente all'apertura della finestra: appartiene al
            -- baseline (intervallo semiaperto, quel tavolo se n'è già andato).
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
    -- Nessun evento dentro la finestra → il baseline È il picco.
    IF NOT v_baseline_locked THEN
        v_peak := v_level;
    END IF;
    IF v_peak < 0 THEN
        v_peak := 0;
    END IF;

    RETURN v_peak;
END;
$$;
