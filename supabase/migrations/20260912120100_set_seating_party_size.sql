-- =============================================================================
-- set_seating_party_size(p_seating_id, p_party_size) — quanti sono, davvero
-- =============================================================================
-- Il gesto dell'host all'ingresso: la prenotazione diceva quattro, ne sono
-- arrivati cinque. È la stessa domanda di `set_seating_tables` — "cosa sta
-- succedendo ORA" — applicata ai coperti invece che ai tavoli.
--
-- ── Non tocca la prenotazione ──────────────────────────────────────────────
-- `reservations.party_size` è la promessa fatta ieri e resta quella che era:
-- serve a chi domani vorrà sapere quanto le promesse ci azzeccano. Qui si
-- scrive il FATTO su `seatings.party_size`. È la distinzione piano/fatto che
-- la 2.4 ha reso visibile sui tavoli, portata sui coperti.
--
-- ── Solo un intero positivo ────────────────────────────────────────────────
-- Zero e negativi → 22023 (il CHECK della tabella li rifiuterebbe comunque,
-- ma con un 23514 che il frontend non mappa; qui l'errore è quello di tutte
-- le altre validazioni d'input del ciclo).
--
-- NULL → 22023, per la stessa ragione per cui `set_seating_tables` rifiuta
-- l'array NULL: sulla colonna NULL significa "ancora ignoto", ed è uno stato
-- legittimo in cui una tavolata NASCE. Ma tornarci da un numero già
-- dichiarato è cancellare un dato che qualcuno ha inserito, e un NULL in
-- ingresso è quasi sempre un parametro dimenticato, non quella decisione.
-- Se un giorno servirà "non lo so più", sarà un gesto suo, esplicito.
--
-- ── Solo su tavolata aperta ────────────────────────────────────────────────
-- I coperti di un servizio concluso sono storia. Correggerli a posteriori è
-- un gesto diverso (con un motivo, una traccia, e un permesso forse diverso)
-- che non si introduce qui. Su una chiusa → 22023.
--
-- ── Lock, poi rilettura ────────────────────────────────────────────────────
-- Stesso schema e stesso ORDINE di `undo_seating`: prima si legge SOLO
-- `activity_id` (per il gate e per la chiave del lock — è l'unico campo che
-- non può cambiare sotto i piedi), poi si prende il lock, poi si rilegge lo
-- stato sotto lock. Leggere `status` prima del lock lascerebbe una finestra
-- in cui un'altra sessione chiude la tavolata e qui si scriverebbe su una
-- riga ormai chiusa. Il danno sarebbe piccolo (un numero su una tavolata
-- chiusa), ma la forma è quella corretta e le sei RPC devono averla tutte:
-- la prossima persona copierà quella che trova.
--
-- Ritorna la riga aggiornata: il chiamante la usa come stato, senza una
-- seconda lettura. Come `open_*` e `close_seating`.
--
-- ACL in 20260912120200..120400 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.set_seating_party_size(
    p_seating_id uuid,
    p_party_size int
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
    v_row         public.seatings;
BEGIN
    -- 1. Sede della tavolata + permesso. Errore uniforme: "non esiste" e
    --    "non autorizzato" sono indistinguibili dall'esterno.
    SELECT s.activity_id
      INTO v_activity_id
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Input. DOPO il gate 42501: chi non può vedere la tavolata non
    --    riceve nemmeno un errore di validazione che ne confermi l'esistenza.
    IF p_party_size IS NULL THEN
        RAISE EXCEPTION 'p_party_size must not be NULL' USING ERRCODE = '22023';
    END IF;

    IF p_party_size <= 0 THEN
        RAISE EXCEPTION 'p_party_size must be a positive integer (got %)', p_party_size
            USING ERRCODE = '22023';
    END IF;

    -- 3. Lock PRIMA di leggere lo stato, e lo stato riletto sotto lock.
    --    Vedi header e `undo_seating` (20260911130400).
    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    SELECT s.status
      INTO v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND THEN
        -- Cancellata (`undo_seating`) da un'altra sessione fra il punto 1 e
        -- il lock: non c'è più niente su cui scrivere.
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 4. Solo su tavolata aperta.
    IF v_status <> 'open' THEN
        RAISE EXCEPTION
            'Only an open seating can change party size (status %). A closed seating is history.',
            v_status
            USING ERRCODE = '22023';
    END IF;

    -- 5. Il fatto. `updated_at` lo muove il trigger della tabella.
    UPDATE public.seatings s
       SET party_size = p_party_size
     WHERE s.id = p_seating_id
    RETURNING s.* INTO v_row;

    RETURN v_row;
END;
$$;
