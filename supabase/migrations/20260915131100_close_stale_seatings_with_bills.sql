-- =============================================================================
-- close_stale_seatings() — chiude tavolata E conto, o salta (12/14)
-- =============================================================================
-- BLOCCO 3 · FASE 3.1. Raffina 20260914160300, non la ribalta: stesso
-- confine (`get_service_day_start()`, l'ultima cinque del mattino), stessa
-- selezione (tavolate `open` aperte prima), stessa assenza di parametri e
-- di ruoli applicativi. Cambia cosa fa con ciascuna:
--
--   - nessun ordine aspetta una decisione (conti senza ordini
--     `submitted|acknowledged|ready`, o nessun conto) → chiude i conti
--     (`_close_order_group_unchecked`, azione `none`) e la tavolata
--     (`_close_seating_unchecked`, `auto`): stanza e conto insieme, perché
--     chiudere l'una e lasciare l'altro è il sistema che produce da solo il
--     disaccordo fra Servizio e Tavoli alle cinque del mattino;
--   - un ordine aspetta una decisione → la SALTA. "Serviti o annullati" non
--     può dirlo nessuno di notte, e inventarlo al posto dell'operatore
--     sarebbe peggio del disaccordo. La tavolata resta aperta, in sala col
--     suo segnale («Aperta da un servizio precedente»): l'host la trova la
--     mattina e decide lui. È "mostra, non impedire" applicato alla macchina.
--
-- Ritorna `{"closed": n, "skipped": m}`: due fatti, e il secondo è quello
-- che vorremo guardare. Come per la 2.8, il valore NON arriva in
-- `cron.job_run_details.return_message` (command tag `1 row`): la traccia è
-- `closed_reason = 'auto'` per le chiuse; per le saltate, la tavolata ancora
-- `open` con `opened_at` prima del confine e un ordine aperto — leggibile con:
--
--   SELECT s.id, s.activity_id, s.opened_at, count(o.id) AS ordini_aperti
--     FROM public.seatings s
--     JOIN public.order_groups og ON og.seating_id = s.id AND og.status = 'open'
--     JOIN public.orders o ON o.order_group_id = og.id
--      AND o.status IN ('submitted','acknowledged','ready')
--    WHERE s.status = 'open' AND s.opened_at < public.get_service_day_start()
--    GROUP BY 1, 2, 3;
--
-- Conta come chiusa solo la tavolata che QUESTA passata ha chiuso
-- (`closed_reason` torna `'auto'`), come prima. I conti senza tavolata (i
-- gruppi zombie pre-3.1) NON sono in scope: nessuno spazzino per i conti.
-- =============================================================================

CREATE FUNCTION public.close_stale_seatings()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_boundary   timestamptz := public.get_service_day_start();
    v_id         uuid;
    v_group_id   uuid;
    v_open_count int;
    v_closed     integer := 0;
    v_skipped    integer := 0;
BEGIN
    FOR v_id IN
        SELECT s.id
          FROM public.seatings s
         WHERE s.status = 'open'
           AND s.opened_at < v_boundary
         ORDER BY s.activity_id, s.opened_at
    LOOP
        SELECT count(*) INTO v_open_count
          FROM public.orders o
          JOIN public.order_groups og ON og.id = o.order_group_id
         WHERE og.seating_id = v_id
           AND og.status = 'open'
           AND o.status IN ('submitted', 'acknowledged', 'ready');

        IF v_open_count > 0 THEN
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        FOR v_group_id IN
            SELECT og.id
              FROM public.order_groups og
             WHERE og.seating_id = v_id
               AND og.status = 'open'
             ORDER BY og.created_at
        LOOP
            PERFORM public._close_order_group_unchecked(v_group_id, 'none');
        END LOOP;

        IF (public._close_seating_unchecked(v_id, 'auto')).closed_reason = 'auto' THEN
            v_closed := v_closed + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('closed', v_closed, 'skipped', v_skipped);
END;
$$;
