-- =========================================
-- RESERVATIONS — Estrazione (1/7): motore di capienza come funzione
-- =========================================
-- Il calcolo del picco concorrente vive oggi INLINE dentro
-- `place_online_reservation`. Serve anche alla nuova lettura di disponibilità
-- ("quali fasce sono libere"), e riscriverlo là significherebbe due
-- implementazioni della stessa regola: il cliente vedrebbe verde su uno slot
-- che il submit rifiuta. Lo estraiamo qui e lo rendiamo l'unica copia.
--
-- Algoritmo INVARIATO rispetto alla v1 (20260607212905):
--   - sweep-line su eventi (start,+party) / (end,-party)
--   - intervalli semiaperti: a t uguale, le uscite precedono gli ingressi
--   - asse continuo di minuti su D-1 / D / D+1, così 23:30+durata che sconfina
--     oltre la mezzanotte è contato correttamente
--   - stati attivi: pending + confirmed
--   - il candidato è incluso nel picco (è il picco POST-inserimento)
--
-- ── SOLA LETTURA ────────────────────────────────────────────────────────────
-- Nessuna scrittura, nessun lock. La serializzazione resta del chiamante:
-- `place_online_reservation` prende `pg_advisory_xact_lock` PRIMA di chiamare
-- questa funzione, e la tiene fino al commit. Spostare il lock qui dentro
-- sarebbe sbagliato — durerebbe quanto la funzione, non quanto la transazione.
--
-- ── CONFIG COME PARAMETRO ───────────────────────────────────────────────────
-- `p_duration_minutes` arriva dal chiamante invece di essere riletta qui: chi
-- chiama ha già la riga `activities` in mano e una seconda SELECT per slot
-- costerebbe senza aggiungere nulla. La fonte resta una sola tabella.
--
-- Ritorna il picco di coperti nella finestra [time, time + duration) INCLUSO
-- il candidato. Mai negativo.

CREATE FUNCTION public.reservation_peak_with_candidate(
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
              AND r.status IN ('pending','confirmed')
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
