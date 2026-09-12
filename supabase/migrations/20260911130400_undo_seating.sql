-- =============================================================================
-- undo_seating(p_seating_id) — "ho premuto sul nome sbagliato"
-- =============================================================================
-- L'host guarda una lista di arrivi, preme "arrivato" sulla riga sopra quella
-- giusta, e se ne accorge due secondi dopo. Senza questa funzione l'unica
-- uscita sarebbe `close_seating`, che lascerebbe in giro una tavolata chiusa
-- di zero minuti e una prenotazione `completed` di gente che non è mai entrata.
--
-- ── Perché non è `close_seating` ───────────────────────────────────────────
-- È la differenza fra "non è successo" e "è finito", e le due cose non vanno
-- mai collassate in un bottone solo:
--
--   close_seating  → il servizio c'è stato e si è concluso. Conserva tutto,
--                    perché è un fatto di sala da cui si impara.
--   undo_seating   → il servizio non è mai cominciato. Cancella tutto, perché
--                    un errore di battitura non è un fatto, e lasciarlo nei
--                    dati avvelena ogni statistica di permanenza al tavolo
--                    con sedute di trenta secondi.
--
-- Qui il DELETE è corretto proprio per la ragione opposta a quella per cui in
-- `close_seating` sarebbe sbagliato.
--
-- ── Solo su tavolata aperta e senza conti ──────────────────────────────────
-- La guardia sui conti oggi è banalmente vera: nessuno scrive ancora
-- `order_groups.seating_id` (il legame arriva nel BLOCCO 3). È scritta lo
-- stesso, adesso, perché è il momento in cui si sa perché serve: quando i
-- conti saranno collegati, cancellare una tavolata con ordini dentro
-- significherebbe staccare quegli ordini dal loro tavolo (la FK è ON DELETE
-- SET NULL) e perdere in silenzio a chi andavano addebitati. Aggiungere la
-- guardia dopo vuol dire aggiungerla dopo il primo danno.
--
-- Su tavolata chiusa → 22023: un servizio concluso non si annulla, si è
-- svolto. Se è stato chiuso per sbaglio, il gesto che serve è riaprirlo, e non
-- esiste ancora.
--
-- ── Lo specchio, all'indietro ──────────────────────────────────────────────
-- Le prenotazioni collegate tornano da `seated` a `confirmed` e `seated_at`
-- torna NULL. Devono tornare esattamente allo stato in cui erano: una
-- prenotazione che resta `seated` dopo l'annullamento della sua tavolata è
-- proprio la divergenza che tutta questa fase esiste per impedire.
--
-- Solo quelle in `seated`: se nel frattempo qualcuno l'ha annullata, resta
-- annullata.
--
-- Le righe di `seating_tables` e `seating_reservations` se ne vanno da sole,
-- via FK ON DELETE CASCADE (20260911100100 / 20260911100200).
--
-- ACL in 20260911130500..130700 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.undo_seating(p_seating_id uuid)
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

    -- 4. Guardia sui conti. Oggi non scatta mai: nessuno scrive ancora
    --    `order_groups.seating_id`. Vedi header.
    IF EXISTS (
        SELECT 1 FROM public.order_groups og WHERE og.seating_id = p_seating_id
    ) THEN
        RAISE EXCEPTION
            'Seating has linked order groups and cannot be undone; close it instead'
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
