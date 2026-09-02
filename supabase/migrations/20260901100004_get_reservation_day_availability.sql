-- =========================================
-- RESERVATIONS — Estrazione (5/7): lettura di disponibilità per fascia
-- =========================================
-- Risponde a "quale di questi orari accetta una prenotazione per N persone",
-- riusando gli STESSI due helper che usa `place_online_reservation`. Nessuna
-- regola riscritta: se la matrice cambia, cambia per entrambe.
--
-- ── LA GRIGLIA NON LA GENERA IL SERVER ──────────────────────────────────────
-- `p_times` arriva dal chiamante. Quali orari esistono dipende da orari di
-- apertura, chiusure straordinarie e dalla regola della coda oltre mezzanotte
-- (`closes_next_day` → gli slot dopo la mezzanotte compaiono sul giorno DOPO),
-- logica che vive in `getDaySlots` / `reservationSlots.ts`. Rigenerarla qui
-- sarebbe una seconda duplicazione, peggiore di quella che stiamo chiudendo.
-- Il client possiede "quali slot esistono", il server "quali accettano".
-- Conseguenza voluta: questa funzione non può contraddire gli orari di
-- apertura, perché non li vede proprio.
--
-- ── COSA NON RESTITUISCE ────────────────────────────────────────────────────
-- Solo `(slot_time, available)`. Niente conteggi, niente posti residui, niente
-- tetti configurati, nemmeno il motivo del blocco: sono informazioni
-- commerciali del locale. Al cliente il motivo non cambia nulla — in entrambi
-- i casi deve scegliere un altro orario — e il messaggio dettagliato resta al
-- submit, dove serve davvero.
--
-- ── SOFT OVERBOOKING ────────────────────────────────────────────────────────
-- Con `reservation_overbooking_form = 'soft'` uno slot oltre capienza ACCETTA
-- (insert pending). Mostrarlo spento sarebbe un falso negativo: il cliente
-- rinuncerebbe a una prenotazione che il locale avrebbe preso. Solo `hard`
-- rende `available = false` per capienza. Il pacing blocca sempre.
--
-- ── COSTO ───────────────────────────────────────────────────────────────────
-- Un paio di chiamate agli helper per slot, ognuna un index scan sul partial
-- `idx_reservations_activity_date_active`, che tocca le poche decine di righe
-- del giorno. Una passata unica sarebbe più efficiente e sarebbe esattamente
-- la duplicazione che stiamo evitando: la correttezza vale il costo.
-- `p_times` è comunque limitato a 96 elementi (una giornata intera a 15
-- minuti) per mettere un tetto al lavoro per richiesta.
--
-- ── SICUREZZA ───────────────────────────────────────────────────────────────
-- SECURITY DEFINER perché gli helper leggono `reservations` scavalcando la
-- RLS. I gate di pubblicazione (sede attiva, prenotazioni abilitate,
-- abbonamento, feature di piano) restano dell'Edge function chiamante, come
-- per `submit-reservation`: qui non si decide CHI può chiedere, solo cosa si
-- risponde.

CREATE FUNCTION public.get_reservation_day_availability(
    p_activity_id      uuid,
    p_reservation_date date,
    p_party_size       int,
    p_times            time[]
)
RETURNS TABLE (
    slot_time time,
    available boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_capacity          int;
    v_duration_minutes  int;
    v_overbooking_form  text;
    v_pace_step         int;
    v_pace_max_covers   int;
    v_pace_max_bookings int;
    v_exists            bool;
    v_time              time;
    v_peak              int;
BEGIN
    IF p_party_size IS NULL OR p_party_size <= 0 THEN
        RAISE EXCEPTION 'invalid_party_size' USING ERRCODE = 'P0001';
    END IF;
    IF p_times IS NULL OR COALESCE(array_length(p_times, 1), 0) = 0 THEN
        RETURN;
    END IF;
    IF array_length(p_times, 1) > 96 THEN
        RAISE EXCEPTION 'too_many_slots' USING ERRCODE = 'P0001';
    END IF;

    SELECT
        true,
        a.reservation_capacity,
        a.reservation_duration_minutes,
        a.reservation_overbooking_form,
        a.reservation_pacing_slot_minutes,
        a.reservation_pacing_max_covers,
        a.reservation_pacing_max_bookings
    INTO
        v_exists,
        v_capacity,
        v_duration_minutes,
        v_overbooking_form,
        v_pace_step,
        v_pace_max_covers,
        v_pace_max_bookings
    FROM public.activities a
    WHERE a.id = p_activity_id;

    IF v_exists IS NOT TRUE THEN
        RAISE EXCEPTION 'activity_not_found' USING ERRCODE = 'P0001';
    END IF;

    FOREACH v_time IN ARRAY p_times LOOP
        slot_time := v_time;

        -- Pacing per primo: è il gate più economico (una sola aggregazione, e
        -- con entrambi i tetti NULL nemmeno quella).
        IF public.reservation_pacing_block(
               p_activity_id, p_reservation_date, v_time, p_party_size,
               v_pace_step, v_pace_max_covers, v_pace_max_bookings
           ) IS NOT NULL THEN
            available := false;
        ELSIF v_capacity IS NULL THEN
            -- Nessuna capienza configurata → nessun gate di capienza.
            available := true;
        ELSIF v_overbooking_form <> 'hard' THEN
            -- soft: la capienza è informativa, lo slot accetta comunque.
            available := true;
        ELSE
            v_peak := public.reservation_peak_with_candidate(
                p_activity_id, p_reservation_date, v_time, p_party_size,
                v_duration_minutes
            );
            available := v_peak <= v_capacity;
        END IF;

        RETURN NEXT;
    END LOOP;
END;
$$;
