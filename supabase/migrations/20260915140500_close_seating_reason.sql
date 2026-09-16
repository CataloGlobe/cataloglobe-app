-- =============================================================================
-- close_seating — motivo «Servizio concluso» (5/6)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1, correzione: passa il motivo di annullamento al cuore
-- `_close_order_group_unchecked(uuid, text, text)` (20260915140200).
-- Firma invariata → CREATE OR REPLACE conserva l'ACL. Corpo identico a
-- 20260915130700 salvo la chiamata; il header di quella migration vale ancora.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.close_seating(
    p_seating_id uuid,
    p_reason     text,
    p_action     text DEFAULT NULL
)
RETURNS public.seatings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_activity_id uuid;
    v_status      text;
    v_seating     public.seatings;
    v_open_count  int;
    v_group_id    uuid;
BEGIN
    -- 1. Tavolata + permesso. Errore uniforme.
    SELECT s.activity_id, s.status
      INTO v_activity_id, v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Il motivo è obbligatorio e ha due soli valori.
    IF p_reason IS NULL OR p_reason NOT IN ('operator', 'auto') THEN
        RAISE EXCEPTION 'p_reason must be one of operator | auto' USING ERRCODE = '22023';
    END IF;

    -- 3. Già chiusa: si restituisce com'è, senza toccare niente.
    IF v_status = 'closed' THEN
        SELECT s.* INTO v_seating FROM public.seatings s WHERE s.id = p_seating_id;
        RETURN v_seating;
    END IF;

    -- 4. L'azione, se c'è, deve avere senso.
    IF p_action IS NOT NULL AND p_action NOT IN ('deliver', 'cancel') THEN
        RAISE EXCEPTION 'p_action must be one of deliver | cancel' USING ERRCODE = '22023';
    END IF;

    -- 5. Ordini che aspettano una decisione, sui conti aperti della comitiva.
    SELECT count(*) INTO v_open_count
      FROM public.orders o
      JOIN public.order_groups og ON og.id = o.order_group_id
     WHERE og.seating_id = p_seating_id
       AND og.status = 'open'
       AND o.status IN ('submitted', 'acknowledged', 'ready');

    IF v_open_count > 0 AND p_action IS NULL THEN
        RAISE EXCEPTION 'OPEN_ORDERS_NEED_ACTION:%', v_open_count
            USING ERRCODE = '22023';
    END IF;

    -- 6. I conti, poi la tavolata. Ciascuno nel proprio cuore.
    FOR v_group_id IN
        SELECT og.id
          FROM public.order_groups og
         WHERE og.seating_id = p_seating_id
           AND og.status = 'open'
         ORDER BY og.created_at
    LOOP
        PERFORM public._close_order_group_unchecked(
            v_group_id, COALESCE(p_action, 'none'), 'Servizio concluso'
        );
    END LOOP;

    RETURN public._close_seating_unchecked(p_seating_id, p_reason);
END;
$$;
