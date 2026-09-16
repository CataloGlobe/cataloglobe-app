-- =============================================================================
-- close_stale_seatings — motivo «Chiusura automatica a fine servizio» (6/6)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1, correzione: passa il motivo di annullamento al cuore
-- `_close_order_group_unchecked(uuid, text, text)` (20260915140200).
-- Firma invariata → CREATE OR REPLACE conserva l'ACL. Corpo identico a
-- 20260915131100 salvo la chiamata; il header di quella migration vale ancora.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.close_stale_seatings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_boundary   timestamptz := public.get_service_day_start();
    v_id         uuid;
    v_group_id   uuid;
    v_open_count int;
    v_closed     integer := 0;
    v_skipped    integer := 0;
BEGIN
    FOR v_id IN
        SELECT s.id
          FROM public.seatings s
         WHERE s.status = 'open'
           AND s.opened_at < v_boundary
         ORDER BY s.activity_id, s.opened_at
    LOOP
        SELECT count(*) INTO v_open_count
          FROM public.orders o
          JOIN public.order_groups og ON og.id = o.order_group_id
         WHERE og.seating_id = v_id
           AND og.status = 'open'
           AND o.status IN ('submitted', 'acknowledged', 'ready');

        IF v_open_count > 0 THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        FOR v_group_id IN
            SELECT og.id
              FROM public.order_groups og
             WHERE og.seating_id = v_id
               AND og.status = 'open'
             ORDER BY og.created_at
        LOOP
            -- Mai scritto: con ordini da decidere la tavolata viene saltata, e
            -- `none` non annulla niente. Il parametro è obbligatorio, e una
            -- stringa finta sarebbe peggio di una vera che non si usa.
            PERFORM public._close_order_group_unchecked(
                v_group_id, 'none', 'Chiusura automatica a fine servizio'
            );
        END LOOP;

        IF (public._close_seating_unchecked(v_id, 'auto')).closed_reason = 'auto' THEN
            v_closed := v_closed + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('closed', v_closed, 'skipped', v_skipped);
END;
$$;
