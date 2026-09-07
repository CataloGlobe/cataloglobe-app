-- =========================================
-- RESERVATIONS — Assegnazione tavoli (4/7): il motore
-- =========================================
-- Assegna automaticamente i tavoli a UNA prenotazione, scrivendo righe
-- 'system' in `reservation_tables`. Nessuna UI, nessun aggancio alle sessioni
-- QR: un tavolo con sessione aperta resta assegnabile per fasce future.
--
-- ── REGOLE FISSATE (non ridiscutere qui) ────────────────────────────────────
--   - Finestra di occupazione = [date+time, +activities.reservation_duration_minutes).
--     Identica in modalità 'turni' e 'continua'. Nessun buffer di riassetto.
--   - Occupano: status IN ('pending','confirmed','seated'). Gli altri no.
--   - Le righe di ponte NON si cancellano al cambio di status: l'occupazione
--     è sempre derivata via join. Solo il RICALCOLO cancella, e solo le 'system'.
--   - Se esiste anche UNA riga 'manual' per la prenotazione → l'assegnazione è
--     fissa, il motore esce senza toccare nulla.
--   - Fallimento = prenotazione senza tavolo. MAI eccezione, MAI cambio status.
--   - Non si sposta mai l'assegnazione di un'altra prenotazione.
--   - Esclusi sempre: deleted_at IS NOT NULL, maintenance_mode, NOT bookable_online.
--
-- ── CAPIENZA EFFETTIVA ──────────────────────────────────────────────────────
--   eff_min = COALESCE(min_seats, seats, 1)
--   eff_max = COALESCE(max_seats, seats)
-- `seats` è nullable: un tavolo senza alcuna capienza massima ricavabile non
-- è valutabile e viene escluso dai candidati (non è un errore: è un tavolo
-- che il ristoratore non ha ancora descritto).
--
-- ── ALGORITMO, tre passate, ci si ferma alla prima che produce ──────────────
--   P1 singolo contenente:   eff_min <= party <= eff_max
--   P2 singolo min rilassato: eff_max >= party (ignora eff_min)
--   Ordinamento P1/P2: spreco (eff_max - party) ASC, assignment_priority DESC,
--   id ASC. Lo spreco PRIMA della priorità è voluto: la priorità sceglie fra
--   tavoli equivalenti, non piazza due persone a un tavolo da otto.
--   P1 e P2 sono una sola query: il flag `fits_min` in testa all'ORDER BY mette
--   tutte le righe P1 prima di ogni riga P2, LIMIT 1 → stessa semantica delle
--   due passate separate.
--   P3 accostamento: solo tavoli con lo stesso combination_group_id NOT NULL,
--   tutti liberi nella finestra. Greedy per gruppo: eff_max DESC, accumula
--   finché la somma copre party. Max 3 tavoli. Fra i gruppi: meno tavoli,
--   poi meno spreco, poi assignment_priority DESC del primo tavolo, poi id ASC.
--   Un singolo tavolo capiente sarebbe già uscito in P1/P2, quindi in P3 una
--   combinazione valida ha sempre >= 2 tavoli.
--
-- ── LOCK ────────────────────────────────────────────────────────────────────
-- Stessa chiave di `place_online_reservation`
-- (hashtextextended('reservation:'||activity_id, 0)). Gli advisory lock sono
-- re-entrant nella stessa sessione: chiamata DENTRO la RPC non deadlocka,
-- chiamata da sola si serializza con i submit. Tenuto fino al commit.
--
-- ── TENANT ISOLATION ────────────────────────────────────────────────────────
-- SECURITY DEFINER: la RLS non protegge. I candidati sono filtrati su
-- (activity_id, tenant_id) della prenotazione; l'INSERT copia tenant_id e
-- activity_id dalla prenotazione; la FK composta
-- (table_id, activity_id) → tables(id, activity_id) rende impossibile a
-- livello DB legare un tavolo di un'altra sede. Il REVOKE è nel file 5/7.
--
-- ── RETURNS TABLE e alias ───────────────────────────────────────────────────
-- La colonna OUT `table_id` è in scope nel body: ogni riferimento a colonne
-- omonime è qualificato con alias di tabella (gotcha già incontrato in
-- 20260530190000). Le variabili locali usano il prefisso v_.
--
-- Ritorna:
--   - una riga per tavolo assegnato: (table_id, true, 'single'|'single_relaxed_min'|'combination')
--   - altrimenti UNA riga (NULL, false, reason) con reason IN
--     ('reservation_not_found','inactive_status','manual_assignment','no_table_available')

CREATE FUNCTION public.assign_tables_for_reservation(
    p_reservation_id uuid
)
RETURNS TABLE (
    table_id uuid,
    assigned boolean,
    reason   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_tenant_id        uuid;
    v_activity_id      uuid;
    v_status           text;
    v_party_size       int;
    v_date             date;
    v_time             time;
    v_duration_minutes int;
    v_start            timestamp;
    v_end              timestamp;
    v_single_table_id  uuid;
    v_single_fits_min  boolean;
    v_group_id         uuid;
    v_group_n          int;
    v_inserted         int := 0;
BEGIN
    -- 1. Prenotazione. Serve activity_id per la chiave del lock.
    SELECT r.tenant_id, r.activity_id, r.status, r.party_size,
           r.reservation_date, r.reservation_time
      INTO v_tenant_id, v_activity_id, v_status, v_party_size, v_date, v_time
      FROM public.reservations r
     WHERE r.id = p_reservation_id;

    IF v_activity_id IS NULL THEN
        table_id := NULL; assigned := false; reason := 'reservation_not_found';
        RETURN NEXT; RETURN;
    END IF;

    -- 2. Lock per sede, stessa chiave della RPC di submit. Re-entrant.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || v_activity_id::text, 0)
    );

    -- 3. Solo le prenotazioni che occupano un tavolo vengono assegnate.
    IF v_status IS NULL OR v_status NOT IN ('pending', 'confirmed', 'seated')
       OR v_party_size IS NULL OR v_party_size <= 0 THEN
        table_id := NULL; assigned := false; reason := 'inactive_status';
        RETURN NEXT; RETURN;
    END IF;

    -- 4. Assegnazione fissa dall'operatore: non si tocca.
    IF EXISTS (
        SELECT 1
          FROM public.reservation_tables rt
         WHERE rt.reservation_id = p_reservation_id
           AND rt.assignment_source = 'manual'
    ) THEN
        table_id := NULL; assigned := false; reason := 'manual_assignment';
        RETURN NEXT; RETURN;
    END IF;

    -- 5. Finestra di occupazione.
    SELECT a.reservation_duration_minutes
      INTO v_duration_minutes
      FROM public.activities a
     WHERE a.id = v_activity_id;
    v_duration_minutes := COALESCE(v_duration_minutes, 120);

    v_start := (v_date + v_time)::timestamp;
    v_end   := v_start + make_interval(mins => v_duration_minutes);

    -- 6. Ricalcolo: via le proposte precedenti del motore (solo 'system').
    DELETE FROM public.reservation_tables rt
     WHERE rt.reservation_id = p_reservation_id
       AND rt.assignment_source = 'system';

    -- 7. P1 + P2: tavolo singolo.
    --    `cand` = tavoli della sede, prenotabili online, non in manutenzione,
    --    non cancellati, con capienza massima calcolabile e SENZA sovrapposizione
    --    con una prenotazione attiva già assegnata (intervalli semiaperti:
    --    a.start < b.end AND b.start < a.end). Filtro date ±1 giorno per
    --    sfruttare idx_reservations_activity_date_active.
    SELECT c.id, c.fits_min
      INTO v_single_table_id, v_single_fits_min
      FROM (
          SELECT t.id,
                 COALESCE(t.max_seats, t.seats)::int            AS eff_max,
                 COALESCE(t.min_seats, t.seats, 1)::int         AS eff_min,
                 t.assignment_priority,
                 (COALESCE(t.min_seats, t.seats, 1) <= v_party_size) AS fits_min
            FROM public.tables t
           WHERE t.activity_id = v_activity_id
             AND t.tenant_id   = v_tenant_id
             AND t.deleted_at IS NULL
             AND t.maintenance_mode = false
             AND t.bookable_online  = true
             AND COALESCE(t.max_seats, t.seats) IS NOT NULL
             AND COALESCE(t.max_seats, t.seats) >= v_party_size
             AND NOT EXISTS (
                 SELECT 1
                   FROM public.reservation_tables rt
                   JOIN public.reservations o ON o.id = rt.reservation_id
                  WHERE rt.table_id = t.id
                    AND rt.reservation_id <> p_reservation_id
                    AND o.activity_id = v_activity_id
                    AND o.status IN ('pending', 'confirmed', 'seated')
                    AND o.reservation_date BETWEEN v_date - 1 AND v_date + 1
                    AND (o.reservation_date + o.reservation_time)::timestamp < v_end
                    AND (o.reservation_date + o.reservation_time)::timestamp
                        + make_interval(mins => v_duration_minutes) > v_start
             )
      ) c
     ORDER BY c.fits_min DESC,
              (c.eff_max - v_party_size) ASC,
              c.assignment_priority DESC,
              c.id ASC
     LIMIT 1;

    IF v_single_table_id IS NOT NULL THEN
        INSERT INTO public.reservation_tables
            (tenant_id, activity_id, reservation_id, table_id, assignment_source)
        VALUES
            (v_tenant_id, v_activity_id, p_reservation_id, v_single_table_id, 'system');

        table_id := v_single_table_id;
        assigned := true;
        reason   := CASE WHEN v_single_fits_min THEN 'single' ELSE 'single_relaxed_min' END;
        RETURN NEXT; RETURN;
    END IF;

    -- 8. P3: accostamento dentro un gruppo. Greedy per gruppo (eff_max DESC),
    --    cumulata con window function, scelta del gruppo migliore.
    WITH cand AS (
        SELECT t.id,
               t.combination_group_id,
               COALESCE(t.max_seats, t.seats)::int AS eff_max,
               t.assignment_priority
          FROM public.tables t
         WHERE t.activity_id = v_activity_id
           AND t.tenant_id   = v_tenant_id
           AND t.deleted_at IS NULL
           AND t.maintenance_mode = false
           AND t.bookable_online  = true
           AND t.combination_group_id IS NOT NULL
           AND COALESCE(t.max_seats, t.seats) IS NOT NULL
           AND NOT EXISTS (
               SELECT 1
                 FROM public.reservation_tables rt
                 JOIN public.reservations o ON o.id = rt.reservation_id
                WHERE rt.table_id = t.id
                  AND rt.reservation_id <> p_reservation_id
                  AND o.activity_id = v_activity_id
                  AND o.status IN ('pending', 'confirmed', 'seated')
                  AND o.reservation_date BETWEEN v_date - 1 AND v_date + 1
                  AND (o.reservation_date + o.reservation_time)::timestamp < v_end
                  AND (o.reservation_date + o.reservation_time)::timestamp
                      + make_interval(mins => v_duration_minutes) > v_start
           )
    ),
    ranked AS (
        SELECT c.id,
               c.combination_group_id,
               c.eff_max,
               c.assignment_priority,
               ROW_NUMBER() OVER w AS rn,
               SUM(c.eff_max) OVER (w ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum
          FROM cand c
        WINDOW w AS (
            PARTITION BY c.combination_group_id
            ORDER BY c.eff_max DESC, c.assignment_priority DESC, c.id ASC
        )
    ),
    -- Primo rn per gruppo in cui la cumulata copre il gruppo, entro 3 tavoli.
    solutions AS (
        SELECT r.combination_group_id,
               MIN(r.rn) AS n_tables
          FROM ranked r
         WHERE r.rn <= 3
           AND r.cum >= v_party_size
         GROUP BY r.combination_group_id
    ),
    scored AS (
        SELECT s.combination_group_id,
               s.n_tables,
               (SELECT r2.cum FROM ranked r2
                 WHERE r2.combination_group_id = s.combination_group_id
                   AND r2.rn = s.n_tables) - v_party_size          AS waste,
               (SELECT r3.assignment_priority FROM ranked r3
                 WHERE r3.combination_group_id = s.combination_group_id
                   AND r3.rn = 1)                                  AS first_priority,
               (SELECT r4.id FROM ranked r4
                 WHERE r4.combination_group_id = s.combination_group_id
                   AND r4.rn = 1)                                  AS first_id
          FROM solutions s
    )
    SELECT sc.combination_group_id, sc.n_tables
      INTO v_group_id, v_group_n
      FROM scored sc
     ORDER BY sc.n_tables ASC, sc.waste ASC, sc.first_priority DESC, sc.first_id ASC
     LIMIT 1;

    IF v_group_id IS NULL THEN
        table_id := NULL; assigned := false; reason := 'no_table_available';
        RETURN NEXT; RETURN;
    END IF;

    -- 9. Inserisce i primi n tavoli del gruppo vincente, ricalcolando lo
    --    stesso ordinamento greedy (deterministico: stessi dati, stesso lock).
    INSERT INTO public.reservation_tables
        (tenant_id, activity_id, reservation_id, table_id, assignment_source)
    SELECT v_tenant_id, v_activity_id, p_reservation_id, g.id, 'system'
      FROM (
          SELECT t.id,
                 ROW_NUMBER() OVER (
                     ORDER BY COALESCE(t.max_seats, t.seats) DESC,
                              t.assignment_priority DESC,
                              t.id ASC
                 ) AS rn
            FROM public.tables t
           WHERE t.activity_id = v_activity_id
             AND t.tenant_id   = v_tenant_id
             AND t.combination_group_id = v_group_id
             AND t.deleted_at IS NULL
             AND t.maintenance_mode = false
             AND t.bookable_online  = true
             AND COALESCE(t.max_seats, t.seats) IS NOT NULL
             AND NOT EXISTS (
                 SELECT 1
                   FROM public.reservation_tables rt
                   JOIN public.reservations o ON o.id = rt.reservation_id
                  WHERE rt.table_id = t.id
                    AND rt.reservation_id <> p_reservation_id
                    AND o.activity_id = v_activity_id
                    AND o.status IN ('pending', 'confirmed', 'seated')
                    AND o.reservation_date BETWEEN v_date - 1 AND v_date + 1
                    AND (o.reservation_date + o.reservation_time)::timestamp < v_end
                    AND (o.reservation_date + o.reservation_time)::timestamp
                        + make_interval(mins => v_duration_minutes) > v_start
             )
      ) g
     WHERE g.rn <= v_group_n;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    IF v_inserted = 0 THEN
        table_id := NULL; assigned := false; reason := 'no_table_available';
        RETURN NEXT; RETURN;
    END IF;

    RETURN QUERY
        SELECT rt.table_id, true, 'combination'::text
          FROM public.reservation_tables rt
         WHERE rt.reservation_id = p_reservation_id
           AND rt.assignment_source = 'system'
         ORDER BY rt.table_id;
END;
$$;
