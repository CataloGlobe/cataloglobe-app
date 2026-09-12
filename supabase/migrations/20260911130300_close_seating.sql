-- =============================================================================
-- close_seating(p_seating_id, p_reason) — il servizio è finito
-- =============================================================================
-- Chiude la tavolata e completa le prenotazioni che ci sedevano.
--
-- ── Perché il motivo è un parametro e non un default ───────────────────────
-- `'operator'` = l'host ha premuto "libera il tavolo". `'auto'` = il sistema
-- ha chiuso a fine giornata quello che nessuno aveva chiuso. Sono due fatti
-- diversi, e il secondo è un indicatore: molte chiusure automatiche vogliono
-- dire che la vista di sala non viene usata, cioè che i dati di occupazione
-- non descrivono più la realtà. Senza la colonna, quel segnale non esiste.
--
-- ── Le righe di `seating_tables` NON si cancellano ─────────────────────────
-- L'occupazione si deriva dallo STATO della tavolata, non dalla presenza delle
-- righe ponte. Stessa regola di `reservation_tables`, che non si cancella al
-- cambio di stato della prenotazione (20260907120200), e stesso motivo: lo
-- storico di chi sedeva dove va conservato. Cancellare qui renderebbe
-- impossibile rispondere a "chi c'era al tavolo 7 sabato sera", che è la
-- domanda per cui questa tabella esiste.
--
-- ── Lo specchio sulla prenotazione ─────────────────────────────────────────
-- Le prenotazioni collegate che sono in `seated` passano a `completed` con
-- `completed_at`, che insieme a `seated_at` dà il tempo di permanenza al
-- tavolo — la ragione per cui le due colonne furono create il 15 giugno.
--
-- Quelle in altri stati si lasciano stare. Il caso concreto: una prenotazione
-- unita alla tavolata ma poi annullata resta `cancelled`, e chiudere il tavolo
-- non la resuscita in `completed`. Il filtro `status = 'seated'` non è
-- prudenza generica, è quello che impedisce alla chiusura di riscrivere stati
-- che qualcun altro ha deciso.
--
-- ── Idempotenza ───────────────────────────────────────────────────────────
-- Chiudere una tavolata già chiusa non è un errore e NON sposta i timestamp:
-- `closed_at` racconta quando il servizio è finito davvero, e una seconda
-- pressione del bottone non deve poterlo spostare in avanti. Si restituisce la
-- riga com'è.
--
-- ── Non tocca ordini né conti ──────────────────────────────────────────────
-- `order_groups.seating_id` esiste (20260911100300) ma nessuno lo scrive
-- ancora, e questa funzione non lo legge. Chiudere la tavolata NON chiude il
-- conto: il legame fra i due cicli è roba del BLOCCO 3, e va deciso lì invece
-- di essere dato per scontato qui.
--
-- ACL in 20260911130500..130700 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.close_seating(
    p_seating_id uuid,
    p_reason     text
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
BEGIN
    -- 1. Tavolata + permesso. Errore uniforme.
    SELECT s.activity_id, s.status
      INTO v_activity_id, v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Il motivo è obbligatorio e ha due soli valori. Lo stesso CHECK vive
    --    sulla tabella; qui l'errore è 22023 invece di 23514.
    IF p_reason IS NULL OR p_reason NOT IN ('operator', 'auto') THEN
        RAISE EXCEPTION 'p_reason must be one of operator | auto' USING ERRCODE = '22023';
    END IF;

    -- 3. Già chiusa: si restituisce com'è, senza toccare i timestamp.
    IF v_status = 'closed' THEN
        SELECT s.* INTO v_seating FROM public.seatings s WHERE s.id = p_seating_id;
        RETURN v_seating;
    END IF;

    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    -- 4. Chiusura. Il predicato `status = 'open'` viaggia dentro l'UPDATE:
    --    due chiusure concorrenti non si sovrascrivono il `closed_at`.
    UPDATE public.seatings s
       SET status        = 'closed',
           closed_at     = now(),
           closed_reason = p_reason
     WHERE s.id = p_seating_id
       AND s.status = 'open'
    RETURNING * INTO v_seating;

    IF NOT FOUND THEN
        -- Qualcun altro ha chiuso fra il punto 1 e qui. Non è un errore: è lo
        -- stesso caso del punto 3, arrivato per un'altra strada.
        SELECT s.* INTO v_seating FROM public.seatings s WHERE s.id = p_seating_id;
        RETURN v_seating;
    END IF;

    -- 5. Lo specchio: solo chi era davvero seduto.
    UPDATE public.reservations r
       SET status       = 'completed',
           completed_at = now()
     WHERE r.id IN (
               SELECT sr.reservation_id
                 FROM public.seating_reservations sr
                WHERE sr.seating_id = p_seating_id
           )
       AND r.status = 'seated';

    RETURN v_seating;
END;
$$;
