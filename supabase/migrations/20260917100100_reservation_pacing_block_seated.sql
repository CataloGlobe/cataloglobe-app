-- =========================================
-- RESERVATIONS — FASE 5.1 (2/4): `seated` occupa capienza (pacing)
-- =========================================
-- Gemello di 20260917100000: gli arrivi di una fascia contano anche le
-- comitive già sedute. Un `seated` è un arrivo avvenuto, non un arrivo in
-- meno. Corpo identico a 20260901100001 salvo la lista degli stati.
--
-- CREATE OR REPLACE conserva i grant esistenti: nessun REVOKE/GRANT qui.

CREATE OR REPLACE FUNCTION public.reservation_pacing_block(
    p_activity_id      uuid,
    p_reservation_date date,
    p_reservation_time time,
    p_party_size       int,
    p_slot_minutes     int,
    p_max_covers       int,
    p_max_bookings     int
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_bucket_index    int;
    v_bucket_covers   int;
    v_bucket_bookings int;
BEGIN
    IF p_max_covers IS NULL AND p_max_bookings IS NULL THEN
        RETURN NULL;
    END IF;
    IF p_slot_minutes IS NULL OR p_slot_minutes <= 0 THEN
        RAISE EXCEPTION 'reservation_pacing_block: passo fascia non valido (%)', p_slot_minutes
            USING ERRCODE = 'P0001';
    END IF;

    -- Bucket = indice della fascia dalla mezzanotte di reservation_date.
    -- Divisione intera fra non-negativi → floor.
    v_bucket_index := (EXTRACT(HOUR FROM p_reservation_time)::int * 60
                     + EXTRACT(MINUTE FROM p_reservation_time)::int)
                     / p_slot_minutes;

    -- Solo la stessa data di calendario: gli arrivi sono ancorati alla loro
    -- data così come sono memorizzati (colonne separate date/time), ed è anche
    -- il modo in cui il form pubblico offre le code oltre la mezzanotte.
    -- Copertura indice: idx_reservations_activity_date_active.
    SELECT COALESCE(SUM(r.party_size), 0), COUNT(*)
    INTO v_bucket_covers, v_bucket_bookings
    FROM public.reservations r
    WHERE r.activity_id = p_activity_id
      AND r.reservation_date = p_reservation_date
      AND r.status IN ('pending','confirmed','seated')
      AND r.party_size > 0
      AND ((EXTRACT(HOUR FROM r.reservation_time)::int * 60
          + EXTRACT(MINUTE FROM r.reservation_time)::int) / p_slot_minutes)
          = v_bucket_index;

    -- Il candidato non è ancora inserito: va sommato a mano. Vince il primo
    -- tetto che scatta (i due sono indipendenti per progetto).
    IF p_max_covers IS NOT NULL
       AND v_bucket_covers + p_party_size > p_max_covers THEN
        RETURN 'pacing_covers';
    END IF;

    IF p_max_bookings IS NOT NULL
       AND v_bucket_bookings + 1 > p_max_bookings THEN
        RETURN 'pacing_bookings';
    END IF;

    RETURN NULL;
END;
$$;
