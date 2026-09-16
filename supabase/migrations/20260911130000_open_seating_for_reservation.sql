-- =============================================================================
-- open_seating_for_reservation(p_reservation_id) — l'ospite è arrivato
-- =============================================================================
-- Primo dei cinque gesti che fanno vivere una tavolata (FASE 2.2). Apre la
-- tavolata a partire da una prenotazione, eredita i tavoli pianificati e porta
-- la prenotazione a `seated`.
--
-- ── Chi scrive `reservations.seated_at` ─────────────────────────────────────
-- Da qui in poi: questa funzione, e solo questa. La colonna esiste dal 15
-- giugno (20260615140000) e finora non la scriveva nessuno.
--
-- La regola vale anche al contrario: la tavolata è la SORGENTE DI VERITÀ
-- dell'occupazione, la prenotazione la rispecchia. Nessun gesto deve poter
-- mettere una prenotazione a `seated` senza aprire la tavolata corrispondente:
-- due stati che possono divergere senza che si sappia quale ha ragione sono
-- peggio di uno stato solo.
--
-- ── Piano e fatto ───────────────────────────────────────────────────────────
-- I tavoli di `reservation_tables` (il PIANO) vengono copiati in
-- `seating_tables` (il FATTO). Da quel momento le due tabelle possono
-- divergere e devono poterlo fare: se l'host sposta la tavolata, cambia il
-- fatto, non il piano.
--
-- Zero tavoli pianificati NON è un errore: il motore può non aver trovato
-- nulla, oppure la sede non gestisce la sala nel sistema. La tavolata nasce
-- senza tavoli e l'host li assegna con `set_seating_tables`. Fallire qui
-- significherebbe impedire di far sedere qualcuno perché il software non sa
-- dove.
--
-- ── Solo da `confirmed` ─────────────────────────────────────────────────────
-- Da `pending` no: non si fa sedere qualcuno la cui richiesta il locale non ha
-- ancora accettato. Se è arrivato lo stesso, l'host conferma prima — è un
-- gesto che esiste già, e lascia la traccia giusta (il cliente riceve la sua
-- email di conferma).
--
-- ── Idempotenza ────────────────────────────────────────────────────────────
-- Il doppio clic esiste, e due tavolate per la stessa prenotazione sono un
-- dato rotto che nessuna query saprebbe più disambiguare. Se esiste già una
-- tavolata APERTA collegata, si restituisce quella e non si tocca nient'altro.
--
-- Il controllo di idempotenza sta PRIMA del gate sullo stato, di proposito:
-- alla seconda pressione la prenotazione è già `seated`, e controllare lo
-- stato per primo farebbe fallire con 22023 proprio il caso che l'idempotenza
-- esiste per assorbire.
--
-- Una tavolata CHIUSA non conta come esistente: il servizio è finito. In quel
-- caso la prenotazione è a `completed` e il gate sullo stato rifiuta —
-- riaprire un servizio concluso è un gesto diverso, che oggi non esiste.
--
-- ── Il lock non basta, e il perché conta ───────────────────────────────────
-- L'advisory lock per sede serializza chi lo prende: due host che premono
-- "arrivato" insieme, due gesti sulla stessa tavolata. NON serializza
-- `respond-reservation`, che scrive su `reservations` da PostgREST senza
-- sapere che questo lock esista.
--
-- Quindi lo stato della prenotazione va riletto sotto lock (punto 3) E
-- riverificato dentro la scrittura finale (punto 9, `AND status = 'confirmed'`).
-- Il primo chiude la finestra fra la lettura e il lock; il secondo chiude
-- quella fra il controllo e l'effetto, che nessun lock nostro può coprire.
--
-- ── Il trigger di assegnazione non scatta ───────────────────────────────────
-- `reservations_assign_tables_on_reschedule` è `AFTER UPDATE OF
-- reservation_date, reservation_time, party_size`: l'UPDATE di solo `status` e
-- `seated_at` non lo sveglia. È voluto — rifare la proposta tavoli mentre la
-- gente si siede non avrebbe senso, la proposta ha smesso di contare.
--
-- ── Permesso: 42501 unico per non-trovato e non-autorizzato ────────────────
-- SECURITY DEFINER, gate interno `has_permission('seatings.manage',
-- activity_id)`. Modello `set_reservation_tables` (20260907170000): un solo
-- 42501 sia se la prenotazione non esiste sia se il chiamante non ha il
-- permesso, così la RPC non fa da oracolo di esistenza di uuid altrui.
--
-- ACL in 20260911130500..130700 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.open_seating_for_reservation(p_reservation_id uuid)
RETURNS public.seatings
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id   uuid;
    v_activity_id uuid;
    v_status      text;
    v_party_size  int;
    v_seating     public.seatings;
BEGIN
    -- 1. Sede e tenant della prenotazione + permesso. Si leggono SOLO i due
    --    campi che non possono cambiare sotto i piedi: servono per il gate e
    --    per la chiave del lock. Stato e coperti si leggono dopo (punto 3).
    SELECT r.tenant_id, r.activity_id
      INTO v_tenant_id, v_activity_id
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: reservation not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Lock per sede, tenuto fino al commit: due pressioni contemporanee del
    --    bottone "arrivato" si serializzano qui, e la seconda trova la tavolata
    --    della prima al punto 4 invece di aprirne un'altra.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    -- 3. Stato e coperti, riletti SOTTO lock. Leggerli prima lascerebbe una
    --    finestra in cui un'altra sessione cambia lo stato fra la lettura e il
    --    lock, e si aprirebbe una tavolata su un `'confirmed'` ormai falso.
    SELECT r.status, r.party_size
      INTO v_status, v_party_size
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

    IF NOT FOUND THEN
        -- Cancellata da un'altra sessione fra il punto 1 e il lock. Stesso
        -- 42501 uniforme: la RPC non fa da oracolo di esistenza.
        RAISE EXCEPTION 'FORBIDDEN: reservation not accessible' USING ERRCODE = '42501';
    END IF;

    -- 4. Idempotenza: c'è già una tavolata aperta per questa prenotazione?
    SELECT s.*
      INTO v_seating
      FROM public.seatings s
      JOIN public.seating_reservations sr ON sr.seating_id = s.id
     WHERE sr.reservation_id = p_reservation_id
       AND s.status = 'open'
     ORDER BY s.opened_at
     LIMIT 1;

    IF FOUND THEN
        RETURN v_seating;
    END IF;

    -- 5. Gate sullo stato. DOPO il gate 42501: non fa da oracolo di esistenza.
    --    È il rifiuto "buono", quello con il messaggio che dice cosa non va;
    --    il compare-and-set del punto 9 è la rete che regge quando questo
    --    controllo diventa obsoleto fra qui e lì.
    IF v_status <> 'confirmed' THEN
        RAISE EXCEPTION
            'Reservation must be confirmed before seating (status %)', v_status
            USING ERRCODE = '22023';
    END IF;

    -- 6. La tavolata. `opened_by_user_id` arriva dal DEFAULT auth.uid(): resta
    --    NULL se un giorno la aprirà il cliente da un QR.
    INSERT INTO public.seatings (tenant_id, activity_id, party_size)
    VALUES (v_tenant_id, v_activity_id, v_party_size)
    RETURNING * INTO v_seating;

    -- 7. Eredità dei tavoli pianificati. Zero righe è un esito normale.
    INSERT INTO public.seating_tables (tenant_id, activity_id, seating_id, table_id)
    SELECT v_tenant_id, v_activity_id, v_seating.id, rt.table_id
      FROM public.reservation_tables rt
     WHERE rt.reservation_id = p_reservation_id;

    -- 8. Il legame con la prenotazione. Molti-a-molti: qui ne entra una sola,
    --    ma unire due prenotazioni in una tavolata non richiederà una migration.
    INSERT INTO public.seating_reservations
        (tenant_id, activity_id, seating_id, reservation_id)
    VALUES (v_tenant_id, v_activity_id, v_seating.id, p_reservation_id);

    -- 9. Lo specchio sulla prenotazione, come COMPARE-AND-SET.
    --
    --    `AND r.status = 'confirmed'` non è una ripetizione del punto 5: è la
    --    parte che chiude davvero la corsa. L'advisory lock serializza solo chi
    --    lo prende, e `respond-reservation` non lo prende — arriva da PostgREST
    --    con un UPDATE diretto su `reservations` e non sa che questo lock
    --    esista. Quindi fra il punto 5 e qui il locale può aver rifiutato o
    --    annullato la prenotazione, e senza questo predicato la riscriveremmo a
    --    `seated` sopra una decisione appena presa.
    --
    --    Il vincolo deve perciò viaggiare DENTRO la scrittura, non in un
    --    controllo che la precede: è lo stesso idioma di `ACTION_EXPECTS` in
    --    `_shared/reservationTransitions.ts`, dove la lista degli stati attesi
    --    finisce in `.in("status", ...)` sull'UPDATE proprio per non lasciare
    --    spazio fra la verifica e l'effetto.
    --
    --    Zero righe = qualcuno ci è arrivato prima. Si solleva 22023 e la
    --    transazione cade: la tavolata e le righe ponte scritte ai punti 6-8
    --    tornano indietro con lei, quindi non resta una tavolata orfana
    --    attaccata a una prenotazione che nel frattempo è stata annullata.
    UPDATE public.reservations r
       SET status = 'seated',
           seated_at = now()
     WHERE r.id = p_reservation_id
       AND r.status = 'confirmed';

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'Reservation changed status while opening the seating; nothing was seated'
            USING ERRCODE = '22023';
    END IF;

    RETURN v_seating;
END;
$$;
