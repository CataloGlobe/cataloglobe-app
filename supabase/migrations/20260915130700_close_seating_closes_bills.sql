-- =============================================================================
-- close_seating(p_seating_id, p_reason, p_action) — chiude anche i conti (8/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. Il gesto «Servizio concluso» chiude anche i conti
-- della comitiva (`order_groups.seating_id = tavolata`, `status = 'open'`):
-- ordini risolti, gruppo chiuso, sessioni cliente scadute — gli stessi
-- effetti di «Chiudi tavolo», dallo stesso cuore (`_close_order_group_unchecked`,
-- 20260915130300). Un evento, due punti d'ingresso.
--
-- ── p_action ───────────────────────────────────────────────────────────────
-- `deliver` | `cancel` | NULL. Serve SOLO se un ordine di quei conti aspetta
-- una decisione (`submitted|acknowledged|ready`): "serviti o annullati" non
-- può deciderlo il sistema. Se nessun ordine aspetta — tutti `delivered` o
-- `cancelled`, o nessun ordine, o nessun conto — la chiusura passa senza
-- chiedere niente, e la dashboard di oggi (che passa due argomenti) continua
-- a funzionare.
--
-- Con ordini da risolvere e `p_action` NULL → 22023
-- `OPEN_ORDERS_NEED_ACTION:<n>`: distinguibile da ogni altro 22023 del ciclo
-- per il prefisso. È il segnale su cui la 3.2 costruirà la domanda nel gesto.
-- `p_action` non valida → 22023 `p_action must be one of deliver | cancel`.
--
-- ── Ordine dei controlli (invariato dove esisteva) ──────────────────────────
--   1. tavolata + permesso        → 42501 uniforme
--   2. motivo                     → 22023
--   3. già chiusa                 → riga com'è, niente toccato (idempotente)
--   4. azione                     → 22023 (nuovo)
--   5. ordini da risolvere senza azione → 22023 OPEN_ORDERS_NEED_ACTION (nuovo)
--   6. conti → cuore dei conti; tavolata → cuore della tavolata.
-- I due cuori non si chiamano fra loro. `_close_seating_unchecked` non
-- cambia (20260914160000).
--
-- Conti già chiusi (`status = 'closed'`) restano com'erano: un conto chiuso
-- ieri da «Chiudi tavolo» non viene toccato da una tavolata chiusa oggi.
--
-- ACL in 130800 (REVOKE) + 130900 (GRANT authenticated): nuova firma, nuovi
-- grant di default da azzerare.
-- =============================================================================

CREATE FUNCTION public.close_seating(
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
        PERFORM public._close_order_group_unchecked(v_group_id, COALESCE(p_action, 'none'));
    END LOOP;

    RETURN public._close_seating_unchecked(p_seating_id, p_reason);
END;
$$;
