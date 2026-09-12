-- =============================================================================
-- set_seating_tables(p_seating_id, p_table_ids) — quali tavoli occupa, adesso
-- =============================================================================
-- Serve a due gesti che sembrano diversi e sono lo stesso: assegnare i tavoli
-- a una tavolata che è nata senza, e spostare la tavolata durante il servizio.
-- Entrambi rispondono alla domanda "dove sono seduti ORA", che ha una sola
-- risposta per volta.
--
-- Da non confondere con `set_reservation_tables` (20260907170000), che scrive
-- il PIANO su `reservation_tables`. Questa scrive il FATTO. Le due possono
-- divergere: spostare una tavolata non riscrive la proposta del motore, e non
-- deve — il piano di stasera resta quello che era, per chi domani vorrà capire
-- quanto il motore ci azzecca.
--
-- ── Sostituzione secca, senza storico ──────────────────────────────────────
-- DELETE + INSERT. Nessuna traccia degli spostamenti intermedi: "questa
-- tavolata è passata dal 4 al 7 alle 21:10" è un'analitica, e si aggiunge
-- dopo (una tabella di eventi, o il campo `assigned_at` già presente) senza
-- rifare niente di questo. Tenere lo storico adesso significherebbe scegliere
-- oggi la forma di un dato che nessuno sta ancora leggendo.
--
-- ── Array vuoto: ammesso ───────────────────────────────────────────────────
-- Al contrario di `set_reservation_tables`, dove l'array vuoto è un errore.
-- La differenza non è una svista: là zero righe significa "nessuna
-- assegnazione" e il motore riassegnerebbe al primo evento, quindi lo stato
-- "senza tavolo per scelta" non è rappresentabile. Qui nessun motore tocca
-- niente, e una tavolata senza tavoli è uno stato legittimo e frequente —
-- è esattamente come nasce un walk-in.
--
-- NULL invece è rifiutato: un array vuoto è una decisione ("nessun tavolo"),
-- un NULL è quasi sempre un parametro dimenticato, e la differenza fra le due
-- cose è tutta la ponte cancellata.
--
-- ── Solo su tavolata aperta ────────────────────────────────────────────────
-- Su una chiusa → 22023. Riscrivere i tavoli di un servizio finito
-- riscriverebbe lo storico di chi sedeva dove, che è l'unica ragione per cui
-- quelle righe sopravvivono alla chiusura.
--
-- ── Nessuna verifica di libertà ────────────────────────────────────────────
-- Come in `open_walkin_seating`: la doppia occupazione si mostra, non si
-- impedisce. I tavoli devono solo esistere, essere di questa sede e di questo
-- tenant, e non essere soft-deleted.
--
-- Ritorna le righe risultanti (SETOF): il chiamante le usa come stato
-- aggiornato, senza una seconda lettura.
--
-- ACL in 20260911130500..130700 (un comando per file).
-- =============================================================================

CREATE FUNCTION public.set_seating_tables(
    p_seating_id uuid,
    p_table_ids  uuid[]
)
RETURNS SETOF public.seating_tables
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id   uuid;
    v_activity_id uuid;
    v_status      text;
    v_requested   int;
    v_valid       int;
BEGIN
    -- 1. Tavolata + permesso. Errore uniforme.
    SELECT s.tenant_id, s.activity_id, s.status
      INTO v_tenant_id, v_activity_id, v_status
      FROM public.seatings s
     WHERE s.id = p_seating_id;

    IF NOT FOUND OR NOT public.has_permission('seatings.manage', v_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: seating not accessible' USING ERRCODE = '42501';
    END IF;

    -- 2. Solo su tavolata aperta. DOPO il gate 42501.
    IF v_status <> 'open' THEN
        RAISE EXCEPTION 'Seating is not open (status %)', v_status USING ERRCODE = '22023';
    END IF;

    -- 3. Input. L'array vuoto passa, il NULL no (vedi header).
    IF p_table_ids IS NULL THEN
        RAISE EXCEPTION 'p_table_ids must not be NULL (use an empty array to clear)'
            USING ERRCODE = '22023';
    END IF;

    v_requested := cardinality(p_table_ids);

    IF EXISTS (SELECT 1 FROM unnest(p_table_ids) AS x WHERE x IS NULL) THEN
        RAISE EXCEPTION 'NULL element in p_table_ids' USING ERRCODE = '22023';
    END IF;

    IF (SELECT count(DISTINCT x) FROM unnest(p_table_ids) AS x) <> v_requested THEN
        RAISE EXCEPTION 'Duplicate table_id in p_table_ids' USING ERRCODE = '22023';
    END IF;

    -- 4. Lock per sede: nessuno vede lo stato intermedio fra il DELETE e
    --    l'INSERT, in cui la tavolata risulterebbe senza tavoli.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('seating:' || v_activity_id::text, 0)
    );

    -- 5. I tavoli devono essere di questa sede e di questo tenant.
    IF v_requested > 0 THEN
        SELECT count(*)
          INTO v_valid
          FROM public.tables t
         WHERE t.id = ANY (p_table_ids)
           AND t.activity_id = v_activity_id
           AND t.tenant_id   = v_tenant_id
           AND t.deleted_at IS NULL;

        IF v_valid <> v_requested THEN
            RAISE EXCEPTION 'FORBIDDEN: one or more tables not accessible'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    -- 6. Sostituzione integrale.
    DELETE FROM public.seating_tables st
     WHERE st.seating_id = p_seating_id;

    INSERT INTO public.seating_tables (tenant_id, activity_id, seating_id, table_id)
    SELECT v_tenant_id, v_activity_id, p_seating_id, x
      FROM unnest(p_table_ids) AS x;

    RETURN QUERY
        SELECT st.*
          FROM public.seating_tables st
         WHERE st.seating_id = p_seating_id
         ORDER BY st.table_id;
END;
$$;
