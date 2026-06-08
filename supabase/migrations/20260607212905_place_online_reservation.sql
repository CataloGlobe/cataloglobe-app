-- =========================================
-- RESERVATIONS — Atomic online placement (Step 3)
-- =========================================
-- One RPC, one transaction, one source of truth: capacity gate + insert run
-- under a per-activity advisory lock so two concurrent submits CANNOT both
-- confirm into the same slot. Replaces the Deno port of the capacity engine
-- in `submit-reservation/index.ts` (which is removed in the same change).
--
-- Algorithm mirrors `src/utils/reservationCapacity.ts` exactly:
--   - sweep over (start,+party), (end,-party) events
--   - half-open intervals: at equal t, departures fire BEFORE arrivals
--   - continuous minute axis spanning D-1 / D / D+1 so 23:30+00:30 overlap
--     is scored correctly even with party_size that crosses midnight
--   - status filter pending + confirmed
--   - candidate is included in the peak computation
--
-- Return shape:
--   reservation_id uuid   — NULL when status='full'
--   status         text   — 'confirmed' | 'pending' | 'full'
--   peak           int    — peak concurrent covers in the candidate window
--   capacity       int    — venue capacity (NULL = unlimited)
--
-- Status meaning:
--   'confirmed' → row inserted, auto-confirm path (capacity set + mode=auto +
--                 under capacity)
--   'pending'   → row inserted, awaits admin (manuale, or auto+soft over)
--   'full'      → NO row inserted; caller surfaces 409 CAPACITY_FULL
--                 (auto/manuale + hard + over capacity)
--
-- Security: SECURITY DEFINER, search_path locked, REVOKE FROM PUBLIC + anon +
-- authenticated, GRANT only to service_role. The Edge function (service_role
-- client) is the only legitimate caller.

BEGIN;

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
    capacity       int
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
    --    activity → serialized. Released at commit.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || p_activity_id::text, 0)
    );

    -- 2. Activity config + tenant.
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

    -- 3. No capacity configured → no gate, pending insert (V0 behavior).
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

    -- 4. Compute peak concurrent including candidate.
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

    -- 5. Decision matrix.
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
        RETURN NEXT;
        RETURN;
    END IF;

    -- 6. Insert with the resolved status.
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
$$;

REVOKE ALL ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) FROM anon;
REVOKE ALL ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.place_online_reservation(
    uuid, date, time, int, text, text, text, text, text
) TO service_role;

COMMIT;
