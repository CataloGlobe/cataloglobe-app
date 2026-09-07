-- =============================================================================
-- set_reservation_tables(p_reservation_id, p_table_ids) — assegnazione manuale
-- =============================================================================
-- Primo dei tre gesti dell'operatore sull'assegnazione (FASE 4). L'operatore
-- decide quali tavoli ha una prenotazione; da quel momento l'assegnazione è
-- FISSA: tutte le righe diventano 'manual' e il motore
-- (`assign_tables_for_reservation`, trigger di reschedule, riorganizzazione)
-- non la tocca più.
--
-- ── L'operatore non viene mai bloccato ──────────────────────────────────────
-- Nessuna verifica che i tavoli siano liberi nella finestra della
-- prenotazione. Se assegna un tavolo già occupato, l'operazione riesce: il
-- conflitto lo segnalerà la UI, in una fase successiva. `maintenance_mode`
-- non blocca: è una decisione dell'operatore.
--
-- ── Validazione minima sui tavoli ───────────────────────────────────────────
-- Devono esistere, appartenere alla stessa sede E allo stesso tenant della
-- prenotazione, non essere soft-deleted, senza duplicati nell'array. Un solo
-- tavolo non valido fa fallire TUTTA l'operazione: nessuna riga scritta.
-- Tavolo di un'altra sede / inesistente / cancellato → stesso 42501 uniforme
-- (vedi sotto), per non fare da oracolo di esistenza di uuid altrui.
--
-- ── Array vuoto: rifiutato (22023) ──────────────────────────────────────────
-- "Nessun tavolo, e non riprovarci" NON è rappresentabile nel modello: lo
-- stato manual vive solo sulle righe di `reservation_tables`, e zero righe
-- per il motore significa "nessuna assegnazione" → il prossimo reschedule o
-- una riorganizzazione riassegnerebbero. Decisione: l'array vuoto è un
-- errore di input (22023).
--   - Scartata l'alternativa "array vuoto = cancella tutto e torna al
--     sistema": sarebbe un doppione a metà di
--     `reset_reservation_tables_to_system` (che cancella E richiama subito
--     il motore), con due strade per la stessa intenzione e una che lascia
--     la prenotazione senza tavolo fino al prossimo evento.
--   - Strada prevista se in futuro servirà lo stato "senza tavolo per
--     scelta": una colonna su `reservations` (es.
--     `table_assignment_locked boolean`) che il motore rispetta in testa,
--     come oggi rispetta le righe manual. Schema + motore, fase dedicata.
--
-- ── Solo prenotazioni attive (22023 altrimenti) ─────────────────────────────
-- Su status diverso da pending | confirmed | seated la funzione rifiuta con
-- 22023 PRIMA di toccare la ponte. Stesso buco di
-- `reset_reservation_tables_to_system`: la sostituzione integrale
-- (DELETE + INSERT) su una prenotazione annullata riscriverebbe lo storico di
-- chi sedeva dove, che invece deve sopravvivere alla disdetta per il
-- ripristino dopo undo (20260907120200). Assegnare tavoli a una prenotazione
-- che non occupa è comunque privo di senso. Il controllo sta DOPO il gate
-- 42501: non fa da oracolo di esistenza.
--
-- ── Permesso: 42501 unico per non-trovato e non-autorizzato ─────────────────
-- SECURITY DEFINER: la RLS non protegge nulla, il controllo è qui.
-- `has_permission('reservations.manage', activity_id)` — lo stesso predicato
-- delle policy di scrittura su `reservations` (20260531150545). Modello
-- `regenerate_table_qr_token` (20260703091500): un solo 42501 sia se la
-- prenotazione non esiste sia se il chiamante non ha il permesso, così la
-- RPC non distingue "non c'è" da "non è tua". `auth.uid()` riflette il JWT
-- del chiamante anche sotto DEFINER.
--
-- ── Lock ────────────────────────────────────────────────────────────────────
-- Stessa chiave del motore (`hashtextextended('reservation:'||activity_id,0)`),
-- tenuta fino al commit: nessun submit online o riorganizzazione della
-- stessa sede vede uno stato intermedio (righe cancellate, nuove non ancora
-- scritte).
--
-- Ritorna le righe risultanti di `reservation_tables` (SETOF): il service le
-- usa direttamente come stato aggiornato, senza una seconda lettura.
--
-- ACL in 20260907170300..170500 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.set_reservation_tables(
    p_reservation_id uuid,
    p_table_ids      uuid[]
)
RETURNS SETOF public.reservation_tables
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_activity_id uuid;
    v_tenant_id   uuid;
    v_status      text;
    v_requested   int;
    v_valid       int;
BEGIN
    -- 1. Prenotazione + permesso. Errore uniforme (vedi header).
    SELECT r.activity_id, r.tenant_id, r.status
      INTO v_activity_id, v_tenant_id, v_status
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

    IF NOT FOUND OR NOT public.has_permission('reservations.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: reservation not accessible' USING ERRCODE = '42501';
    END IF;

    -- 1b. Solo prenotazioni attive: la ponte di una disdetta non si riscrive.
    IF v_status NOT IN ('pending', 'confirmed', 'seated') THEN
        RAISE EXCEPTION 'Reservation is not active (status %)', v_status USING ERRCODE = '22023';
    END IF;

    -- 2. Input: array non nullo, non vuoto, senza elementi NULL, senza duplicati.
    IF p_table_ids IS NULL OR cardinality(p_table_ids) = 0 THEN
        RAISE EXCEPTION 'p_table_ids must contain at least one table' USING ERRCODE = '22023';
    END IF;

    v_requested := cardinality(p_table_ids);

    IF EXISTS (SELECT 1 FROM unnest(p_table_ids) AS x WHERE x IS NULL) THEN
        RAISE EXCEPTION 'NULL element in p_table_ids' USING ERRCODE = '22023';
    END IF;

    IF (SELECT count(DISTINCT x) FROM unnest(p_table_ids) AS x) <> v_requested THEN
        RAISE EXCEPTION 'Duplicate table_id in p_table_ids' USING ERRCODE = '22023';
    END IF;

    -- 3. Lock per sede, stessa chiave del motore.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || v_activity_id::text, 0)
    );

    -- 4. Tutti i tavoli devono essere della stessa sede e tenant, non cancellati.
    SELECT count(*)
      INTO v_valid
      FROM public.tables t
     WHERE t.id = ANY (p_table_ids)
       AND t.activity_id = v_activity_id
       AND t.tenant_id   = v_tenant_id
       AND t.deleted_at IS NULL;

    IF v_valid <> v_requested THEN
        RAISE EXCEPTION 'FORBIDDEN: one or more tables not accessible' USING ERRCODE = '42501';
    END IF;

    -- 5. Sostituzione integrale: via tutto (system E manual), dentro le nuove
    --    tutte manual. Da qui l'assegnazione è fissa.
    DELETE FROM public.reservation_tables rt
     WHERE rt.reservation_id = p_reservation_id;

    INSERT INTO public.reservation_tables
        (tenant_id, activity_id, reservation_id, table_id, assignment_source, assigned_at)
    SELECT v_tenant_id, v_activity_id, p_reservation_id, x, 'manual', now()
      FROM unnest(p_table_ids) AS x;

    RETURN QUERY
        SELECT rt.*
          FROM public.reservation_tables rt
         WHERE rt.reservation_id = p_reservation_id
         ORDER BY rt.table_id;
END;
$$;
