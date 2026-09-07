-- =============================================================================
-- reassign_activity_tables(p_activity_id, p_date) — riorganizza una giornata
-- =============================================================================
-- Terzo gesto dell'operatore (FASE 4). Il motore assegna nell'ordine di
-- arrivo delle prenotazioni: chi prenota per primo prende il tavolo migliore
-- per sé, e un gruppo grande arrivato dopo può restare senza posto anche se
-- una disposizione diversa lo avrebbe accolto. Questa funzione ricalcola le
-- assegnazioni 'system' di TUTTE le prenotazioni attive di una sede in una
-- data, in un ordine scelto invece che subito.
--
-- ── Cosa tocca e cosa no ────────────────────────────────────────────────────
--   - Prenotazioni attive (pending | confirmed | seated) di (sede, data).
--   - Quelle con anche UNA riga 'manual' sono saltate integralmente: la
--     decisione dell'operatore resta dov'è e i suoi tavoli restano occupati
--     agli occhi del motore. Contate in `skipped_manual`.
--   - Altri giorni: mai toccati. Le finestre di occupazione degli altri
--     giorni continuano a contare come vincolo (il motore le vede), ma
--     nessuna loro riga viene cancellata o riscritta.
--
-- ── Perché non è un ciclo banale ────────────────────────────────────────────
-- "Per ogni prenotazione, chiama il motore" NON riorganizza niente: il
-- motore, calcolando la prenotazione N, vede occupati i tavoli assegnati
-- alle altre N-1 e riproduce lo stato di partenza. Le righe 'system' delle
-- prenotazioni candidate vanno cancellate TUTTE INSIEME PRIMA del ciclo, così
-- ogni prenotazione parte da una sala in cui contano solo le manual, gli
-- altri giorni e le prenotazioni già ripiazzate in questo giro.
--
-- ── Ordine deterministico ───────────────────────────────────────────────────
--   1. party_size DESC     — il gruppo grande ha meno posti che lo contengono:
--                             servito per primo, altrimenti i piccoli gli
--                             consumano i tavoli grandi.
--   2. reservation_time ASC — a parità di coperti, prima chi arriva prima.
--   3. id ASC              — spareggio stabile: due esecuzioni sugli stessi
--                             dati danno lo stesso risultato.
--
-- ── Permesso: 42501 unico per non-trovato e non-autorizzato ─────────────────
-- `has_permission('reservations.manage', p_activity_id)` dopo aver verificato
-- che la sede esista, modello `regenerate_table_qr_token`. SECURITY DEFINER:
-- senza questo controllo chiunque sia autenticato riorganizzerebbe la sala di
-- qualsiasi tenant.
--
-- ── Lock ────────────────────────────────────────────────────────────────────
-- Stessa chiave del motore, tenuta per tutto il giro: nessun submit online
-- della stessa sede entra fra la cancellazione collettiva e l'ultima
-- riassegnazione. È la sezione critica più lunga della serie (N chiamate al
-- motore): accettabile perché è un gesto esplicito dell'operatore, non un
-- percorso caldo.
--
-- Ritorna una riga di riepilogo:
--   reassigned     — prenotazioni che hanno almeno un tavolo dopo il giro
--   unassigned     — prenotazioni rimaste senza tavolo dopo il giro
--   skipped_manual — prenotazioni attive saltate perché manual
--
-- ACL in 20260907170300..170500.
-- =============================================================================

CREATE FUNCTION public.reassign_activity_tables(
    p_activity_id uuid,
    p_date        date
)
RETURNS TABLE (
    reassigned     int,
    unassigned     int,
    skipped_manual int
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_exists        boolean;
    v_res           record;
    v_got_table     boolean;
    v_reassigned    int := 0;
    v_unassigned    int := 0;
    v_skipped       int := 0;
BEGIN
    -- 1. Sede + permesso. Errore uniforme.
    SELECT EXISTS (SELECT 1 FROM public.activities a WHERE a.id = p_activity_id)
      INTO v_exists;

    IF NOT v_exists OR NOT public.has_permission('reservations.manage', p_activity_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: activity not accessible' USING ERRCODE = '42501';
    END IF;

    IF p_date IS NULL THEN
        RAISE EXCEPTION 'p_date is required' USING ERRCODE = '22023';
    END IF;

    -- 2. Lock per sede, stessa chiave del motore. Tenuto per tutto il giro.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('reservation:' || p_activity_id::text, 0)
    );

    -- 3. Le manual si contano e si saltano. Le candidate sono le attive del
    --    giorno SENZA alcuna riga manual.
    SELECT count(*)
      INTO v_skipped
      FROM public.reservations r
     WHERE r.activity_id = p_activity_id
       AND r.reservation_date = p_date
       AND r.status IN ('pending', 'confirmed', 'seated')
       AND EXISTS (
           SELECT 1 FROM public.reservation_tables rt
            WHERE rt.reservation_id = r.id
              AND rt.assignment_source = 'manual'
       );

    -- 4. Cancellazione COLLETTIVA delle righe system delle candidate, prima
    --    di qualunque chiamata al motore (vedi header: è il punto che rende
    --    la riorganizzazione una riorganizzazione).
    DELETE FROM public.reservation_tables rt
     WHERE rt.assignment_source = 'system'
       AND rt.reservation_id IN (
           SELECT r.id
             FROM public.reservations r
            WHERE r.activity_id = p_activity_id
              AND r.reservation_date = p_date
              AND r.status IN ('pending', 'confirmed', 'seated')
              AND NOT EXISTS (
                  SELECT 1 FROM public.reservation_tables m
                   WHERE m.reservation_id = r.id
                     AND m.assignment_source = 'manual'
              )
       );

    -- 5. Riassegnazione nell'ordine deterministico documentato.
    FOR v_res IN
        SELECT r.id
          FROM public.reservations r
         WHERE r.activity_id = p_activity_id
           AND r.reservation_date = p_date
           AND r.status IN ('pending', 'confirmed', 'seated')
           AND NOT EXISTS (
               SELECT 1 FROM public.reservation_tables m
                WHERE m.reservation_id = r.id
                  AND m.assignment_source = 'manual'
           )
         ORDER BY r.party_size DESC, r.reservation_time ASC, r.id ASC
    LOOP
        SELECT bool_or(a.assigned)
          INTO v_got_table
          FROM public.assign_tables_for_reservation(v_res.id) AS a;

        IF COALESCE(v_got_table, false) THEN
            v_reassigned := v_reassigned + 1;
        ELSE
            v_unassigned := v_unassigned + 1;
        END IF;
    END LOOP;

    reassigned     := v_reassigned;
    unassigned     := v_unassigned;
    skipped_manual := v_skipped;
    RETURN NEXT;
END;
$$;
