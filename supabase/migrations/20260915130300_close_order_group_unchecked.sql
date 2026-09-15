-- =============================================================================
-- _close_order_group_unchecked(p_group_id, p_action) — il cuore di «Chiudi
-- tavolo», per un conto (4/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. Gli EFFETTI della chiusura di un conto, senza il gate:
--   - gli ordini non terminali del gruppo (`submitted|acknowledged|ready`)
--     risolti secondo `p_action`: `deliver` → `delivered`, `cancel` →
--     `cancelled` (`cancelled_by = 'admin'`, motivo «Chiusura tavolo»),
--     `version + 1` come ogni transizione admin;
--   - il gruppo → `closed`, `closed_at = now()`;
--   - le sessioni cliente agganciate al gruppo: `bill_requested_at` e
--     `waiter_called_at` azzerati, `expires_at = now()` (il prossimo QR crea
--     una sessione nuova).
-- È il corpo di `close_table_with_resolution` (20260604100000), portato dal
-- tavolo al singolo conto e senza validazioni: le fa chi chiama.
--
-- ── Perché per conto e non per tavolo ──────────────────────────────────────
-- Chi chiude una TAVOLATA (`close_seating`) deve chiudere i conti di quella
-- comitiva, e li trova per `order_groups.seating_id`, non per tavolo: sullo
-- stesso tavolo può esserci un conto di prima (legacy, senza tavolata) o di
-- un'altra comitiva in doppia occupazione. Chi chiude un TAVOLO
-- (`close_table_with_resolution`) itera i conti aperti del tavolo e chiama
-- questo cuore per ciascuno. Un solo posto in cui vive "come si risolve un
-- ordine alla chiusura": i due gesti non possono divergere.
--
-- ── Ordini che aspettano una decisione ─────────────────────────────────────
-- Con ordini non terminali e `p_action = 'none'` → 22023
-- `OPEN_ORDERS_NEED_ACTION:<n>`. Chi chiama fa lo stesso conto PRIMA, per
-- dare il proprio errore (409 per l'Edge di close-table, 22023 leggibile per
-- `close_seating`): qui è la rete di sicurezza, non il messaggio.
--
-- ── Idempotenza ────────────────────────────────────────────────────────────
-- Gruppo già chiuso → nessun effetto, `closed = false` nel jsonb, timestamp
-- intatti.
--
-- NON tocca `seatings`: i due cuori (`_close_seating_unchecked` e questo)
-- non si chiamano fra loro. Le funzioni pubbliche chiamano entrambi — è ciò
-- che impedisce la ricorsione.
--
-- ACL in 20260915130400: nessun ruolo applicativo.
-- =============================================================================

CREATE FUNCTION public._close_order_group_unchecked(
    p_group_id uuid,
    p_action   text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_now                  timestamptz := now();
    v_status               text;
    v_open_count           int;
    v_resolved_count       int := 0;
    v_closed_orders_count  int := 0;
    v_cleared_bill_count   int := 0;
    v_cleared_waiter_count int := 0;
    v_ended_sessions_count int := 0;
BEGIN
    IF p_action NOT IN ('none', 'deliver', 'cancel') THEN
        RAISE EXCEPTION 'INVALID_ACTION' USING ERRCODE = 'P0001';
    END IF;

    SELECT og.status INTO v_status
      FROM public.order_groups og
     WHERE og.id = p_group_id
       FOR UPDATE;

    IF NOT FOUND OR v_status <> 'open' THEN
        RETURN jsonb_build_object(
            'group_id', p_group_id, 'closed', false,
            'resolved_orders_count', 0, 'closed_orders_count', 0,
            'cleared_bill_count', 0, 'cleared_waiter_count', 0,
            'ended_sessions_count', 0
        );
    END IF;

    SELECT count(*) INTO v_open_count
      FROM public.orders o
     WHERE o.order_group_id = p_group_id
       AND o.status IN ('submitted', 'acknowledged', 'ready');

    IF p_action = 'none' AND v_open_count > 0 THEN
        RAISE EXCEPTION 'OPEN_ORDERS_NEED_ACTION:%', v_open_count
            USING ERRCODE = '22023';
    END IF;

    IF p_action = 'deliver' AND v_open_count > 0 THEN
        UPDATE public.orders o
           SET status       = 'delivered',
               delivered_at = v_now,
               version      = o.version + 1,
               updated_at   = v_now
         WHERE o.order_group_id = p_group_id
           AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    ELSIF p_action = 'cancel' AND v_open_count > 0 THEN
        UPDATE public.orders o
           SET status              = 'cancelled',
               cancelled_at        = v_now,
               cancelled_by        = 'admin',
               cancellation_reason = 'Chiusura tavolo',
               version             = o.version + 1,
               updated_at          = v_now
         WHERE o.order_group_id = p_group_id
           AND o.status IN ('submitted', 'acknowledged', 'ready');
        GET DIAGNOSTICS v_resolved_count = ROW_COUNT;
    END IF;

    UPDATE public.order_groups og
       SET status     = 'closed',
           closed_at  = v_now,
           updated_at = v_now
     WHERE og.id = p_group_id
       AND og.status = 'open';

    SELECT count(*) INTO v_closed_orders_count
      FROM public.orders o
     WHERE o.order_group_id = p_group_id;

    WITH cleared AS (
        UPDATE public.customer_sessions cs
           SET bill_requested_at = NULL, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.bill_requested_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_bill_count FROM cleared;

    WITH cleared_waiter AS (
        UPDATE public.customer_sessions cs
           SET waiter_called_at = NULL, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.waiter_called_at IS NOT NULL
        RETURNING cs.id
    )
    SELECT count(*) INTO v_cleared_waiter_count FROM cleared_waiter;

    WITH ended AS (
        UPDATE public.customer_sessions cs
           SET expires_at = v_now, updated_at = v_now
         WHERE cs.order_group_id = p_group_id
           AND cs.expires_at > v_now
        RETURNING cs.id
    )
    SELECT count(*) INTO v_ended_sessions_count FROM ended;

    RETURN jsonb_build_object(
        'group_id',              p_group_id,
        'closed',                true,
        'resolved_orders_count', v_resolved_count,
        'closed_orders_count',   v_closed_orders_count,
        'cleared_bill_count',    v_cleared_bill_count,
        'cleared_waiter_count',  v_cleared_waiter_count,
        'ended_sessions_count',  v_ended_sessions_count
    );
END;
$$;
