-- =============================================================================
-- undo_seating — la guardia sui conti diventa reale (14/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. Nessuna logica cambia: stessa firma, stesso ordine
-- (gate → lock → stato → guardia → specchio → DELETE), stessa condizione
-- `EXISTS (order_groups WHERE seating_id = …)`, che da 20260915130200 non è
-- più banalmente vera. Cambiano il commento e il MESSAGGIO del punto 4, che
-- deve spiegare perché anche un conto già chiuso blocca l'annullo: la FK
-- `order_groups.seating_id` è ON DELETE SET NULL, e cancellare la tavolata
-- scollegherebbe il conto dalla comitiva. Prefisso `SEATING_HAS_BILLS:` per
-- distinguerlo dagli altri 22023 del ciclo.
--
-- Firma invariata → CREATE OR REPLACE conserva l'ACL (authenticated only).
-- Corpo copiato da 20260911130400; i commenti dei punti 1–3, 5, 6 sono quelli.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.undo_seating(p_seating_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_activity_id uuid;
    v_status      text;
BEGIN
    -- 1. Sede della tavolata + permesso. Si legge SOLO `activity_id`: serve
    --    per il gate e per la chiave del lock, ed è l'unico campo che non può
    --    cambiare sotto i piedi.
    SELECT s.activity_id
      INTO v_activity_id
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock PRIMA di leggere lo stato, e lo stato riletto sotto lock.
    --
    --    L'ordine qui non è stile, è correttezza. Leggere `status` prima del
    --    lock lascia una finestra in cui un'altra sessione chiude la tavolata:
    --    si arriverebbe al punto 3 con un `'open'` ormai falso e si
    --    cancellerebbe una tavolata CHIUSA. Il danno non è la riga persa —
    --    è che `close_seating` ha appena portato le prenotazioni collegate a
    --    `completed`, e il DELETE porterebbe via le righe ponte lasciando
    --    prenotazioni `completed` senza alcuna tavolata da cui derivarle:
    --    esattamente la divergenza che questa fase esiste per impedire, e per
    --    giunta irrecuperabile, perché non resta niente da cui ricostruire.
    --
    --    Sotto lock la finestra non c'è: chi chiude e chi annulla si
    --    serializzano, e il secondo legge lo stato che il primo ha lasciato.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    SELECT s.status
      INTO v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND THEN
        -- Cancellata da un'altra sessione fra il punto 1 e il lock: non c'è
        -- più niente da annullare, e chi l'ha fatto aveva gli stessi permessi.
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 3. Solo su tavolata aperta.
    IF v_status <> 'open' THEN
        RAISE EXCEPTION
            'Only an open seating can be undone (status %). A closed seating happened.',
            v_status
            USING ERRCODE = '22023';
    END IF;

    -- 4. Guardia sui conti. Da 20260915130200 `order_groups.seating_id` è
    --    scritto davvero: la guardia è reale. Prende i conti aperti E quelli
    --    chiusi, apposta: l'annullo cancella la tavolata e la FK è ON DELETE
    --    SET NULL — staccherebbe in silenzio un conto dalla comitiva che lo
    --    ha prodotto. "Non è mai successo" non si può dire di una serata che
    --    ha prodotto ordini. Il messaggio dice questo, non "ci sono ordini
    --    aperti".
    IF EXISTS (
        SELECT 1 FROM public.order_groups og WHERE og.seating_id = p_seating_id
    ) THEN
        RAISE EXCEPTION
            'SEATING_HAS_BILLS: this seating produced orders (open or closed bills) and cannot be undone — undo would detach those bills from the party; close the seating instead'
            USING ERRCODE = '22023';
    END IF;

    -- 5. Lo specchio all'indietro, PRIMA della cancellazione: dopo, le righe
    --    ponte da cui si ricavano le prenotazioni non ci sarebbero più.
    UPDATE public.reservations r
       SET status    = 'confirmed',
           seated_at = NULL
     WHERE r.id IN (
               SELECT sr.reservation_id
                 FROM public.seating_reservations sr
                WHERE sr.seating_id = p_seating_id
           )
       AND r.status = 'seated';

    -- 6. La tavolata non è mai esistita. Le ponti cascadano.
    DELETE FROM public.seatings s WHERE s.id = p_seating_id;
END;
$$;
