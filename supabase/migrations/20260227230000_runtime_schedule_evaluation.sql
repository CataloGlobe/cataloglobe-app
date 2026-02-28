BEGIN;

-- =========================================
-- Schedule runtime evaluation
-- =========================================

CREATE OR REPLACE FUNCTION public.is_schedule_active(s public.v2_schedules)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_now timestamptz := now() AT TIME ZONE 'Europe/Rome';
  v_time time := (v_now)::time;
  v_dow int := extract(dow from v_now);
BEGIN

  IF s.enabled IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  -- ALWAYS
  IF s.time_mode = 'always' THEN
    RETURN TRUE;
  END IF;

  -- WINDOW (days + time)
  IF s.time_mode = 'window' THEN

    IF s.days_of_week IS NOT NULL THEN
      IF NOT (v_dow = ANY (s.days_of_week)) THEN
        RETURN FALSE;
      END IF;
    END IF;

    IF s.time_from IS NOT NULL AND s.time_to IS NOT NULL THEN
      IF NOT (v_time BETWEEN s.time_from AND s.time_to) THEN
        RETURN FALSE;
      END IF;
    END IF;

    RETURN TRUE;
  END IF;

  -- RANGE (date interval)
  IF s.time_mode = 'range' THEN
    IF s.start_at IS NOT NULL AND v_now < s.start_at THEN
      RETURN FALSE;
    END IF;

    IF s.end_at IS NOT NULL AND v_now > s.end_at THEN
      RETURN FALSE;
    END IF;

    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

COMMIT;