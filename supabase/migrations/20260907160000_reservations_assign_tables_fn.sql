-- =============================================================================
-- reservations_assign_tables() — funzione trigger AFTER INSERT / AFTER UPDATE
-- su public.reservations
-- =============================================================================
-- L'assegnazione dei tavoli diventa una proprietà del dato: ogni prenotazione
-- che entra, da qualunque canale (RPC online, INSERT diretto della dashboard,
-- import futuri, query in console), riceve i tavoli dal motore
-- `assign_tables_for_reservation`. E li riceve di nuovo quando cambiano data,
-- ora o coperti: un altro appuntamento, o un altro gruppo, è un'altra
-- richiesta di tavolo.
--
-- ── Perché un trigger e non i call site ─────────────────────────────────────
-- Stessa ragione di `reset_reservation_reminder_on_reschedule`: l'invariante
-- appartiene al dato. Oggi i writer sono due (place_online_reservation e
-- createReservation); metterlo in entrambi vuol dire dimenticarlo nel terzo.
--
-- ── Cosa scatena la riassegnazione ──────────────────────────────────────────
-- Solo reservation_date, reservation_time, party_size, e solo se il valore
-- CAMBIA (IS DISTINCT FROM). Il CREATE TRIGGER (20260907160600) filtra già
-- con `UPDATE OF ... WHEN (...)`; il controllo resta anche qui, come nel
-- trigger del promemoria: la WHEN è un'ottimizzazione, la correttezza non
-- deve dipendere da lei. Un UPDATE di stato, nome, note, reminder non chiama
-- il motore: le righe di `reservation_tables` restano, l'occupazione si
-- deriva via join sullo status.
--
-- ── Il trigger non può mai far fallire la scrittura ─────────────────────────
-- PERFORM avvolta in BEGIN ... EXCEPTION WHEN OTHERS: un errore imprevisto del
-- motore viene loggato con RAISE WARNING (SQLSTATE + SQLERRM + id
-- prenotazione) e la scrittura prosegue. Il blocco EXCEPTION apre una
-- sottotransazione: all'errore si annullano solo le eventuali righe scritte
-- dal motore, non l'INSERT/UPDATE che ha scatenato il trigger (già eseguito:
-- siamo in AFTER). La prenotazione entra senza tavolo, come per
-- `no_table_available`. Gli esiti negativi ordinari (nessun tavolo,
-- assegnazione manual) non sono eccezioni: il motore li ritorna come reason.
--
-- ── SECURITY DEFINER, obbligatorio ──────────────────────────────────────────
-- `assign_tables_for_reservation` è revocata a PUBLIC, anon, authenticated,
-- service_role (20260907150400): solo il proprietario può eseguirla. Con
-- SECURITY INVOKER questa funzione girerebbe come l'utente della dashboard,
-- la PERFORM fallirebbe per permesso negato, e il blocco EXCEPTION lo
-- ingoierebbe: nessun errore, nessun tavolo, mai. DEFINER è l'unico modo per
-- cui il trigger funzioni da ogni canale. `SET search_path TO ''` come da
-- regola; l'unico oggetto referenziato è qualificato `public.`.
--
-- L'isolamento tenant/sede non vive qui ma nel motore: legge tenant_id e
-- activity_id dalla riga di prenotazione (NEW.id) e filtra i candidati su
-- entrambi; le FK composte di `reservation_tables` bloccano a livello DB un
-- tavolo di un'altra sede. Questa funzione passa solo l'id della riga appena
-- scritta.
--
-- ── AFTER, non BEFORE ───────────────────────────────────────────────────────
-- Il motore rilegge la prenotazione dal DB: la riga deve esistere già.
-- RETURN NULL: in un trigger AFTER il valore di ritorno è ignorato.
--
-- ── Lock ────────────────────────────────────────────────────────────────────
-- Il motore prende `pg_advisory_xact_lock` per sede. Dentro
-- `place_online_reservation` è già tenuto (re-entrant, nessun deadlock);
-- dall'INSERT diretto della dashboard viene preso qui per la prima volta e
-- serializza la scrittura con i submit online della stessa sede. Voluto:
-- due canali, una sola coda per sede.
--
-- ACL in 20260907160100..160400 (un comando per file), trigger in
-- 20260907160500 (INSERT) e 20260907160600 (UPDATE).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reservations_assign_tables()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Su UPDATE: esci se nessuno dei tre campi rilevanti è cambiato davvero.
    -- `UPDATE OF` scatta al tocco della colonna, non al cambio di valore.
    IF TG_OP = 'UPDATE'
       AND NEW.reservation_date IS NOT DISTINCT FROM OLD.reservation_date
       AND NEW.reservation_time IS NOT DISTINCT FROM OLD.reservation_time
       AND NEW.party_size       IS NOT DISTINCT FROM OLD.party_size
    THEN
        RETURN NULL;
    END IF;

    -- Sottotransazione: la scrittura che ha scatenato il trigger resta valida
    -- in ogni caso.
    BEGIN
        PERFORM public.assign_tables_for_reservation(NEW.id);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'reservations_assign_tables: motore fallito per prenotazione % (%), prenotazione salvata senza riassegnazione',
            NEW.id, TG_OP
            USING DETAIL = 'SQLSTATE ' || SQLSTATE || ': ' || SQLERRM;
    END;

    RETURN NULL;
END;
$$;
