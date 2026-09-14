-- =============================================================================
-- close_stale_seatings() — lo spazzino di fine servizio
-- =============================================================================
-- Chiude, con `closed_reason = 'auto'`, ogni tavolata ancora `open` che è
-- stata aperta PRIMA dell'inizio della giornata di servizio corrente.
-- Restituisce quante ne ha chiuse.
--
-- ── Il confine ─────────────────────────────────────────────────────────────
-- `public.get_service_day_start()` (20260914155000): l'ultima cinque del
-- mattino trascorsa, Europe/Rome, DST-aware, uguale per tutte le sedi. È il
-- confine della NOTTE di servizio, non della giornata di calendario: alle
-- 00:30 un locale che chiude alle 02:00 ha tavolate vive, e non vanno
-- toccate. Con questo confine la passata è sicura a qualunque ora giri.
--
-- NON legge `activity_hours` né `activity_closures`. "Ancora aperta dopo la
-- chiusura del locale" sarebbe più preciso sulla carta, ma quell'ora è una
-- derivazione (fasce + coda notturna + chiusure straordinarie) che esiste
-- già in due copie TypeScript divergenti, e gli orari mancano sulla
-- maggioranza delle sedi. Una terza copia in SQL, per un dato che spesso non
-- c'è, non compra niente: una tavolata dimenticata a pranzo resta aperta
-- fino a sera con entrambe le regole.
--
-- ── Il gate è la forma ─────────────────────────────────────────────────────
-- Nessun parametro: né sede, né tenant, né id. Non può essere puntata contro
-- le tavolate di qualcuno perché non accetta un bersaglio. Nessun ruolo
-- applicativo la esegue (ACL in 20260914160400, nessun GRANT): la lancia il
-- cron come `postgres`, owner della funzione, che bypassa l'ACL — il
-- precedente è `expire_old_invites` (20260313070000).
--
-- ── Effetti ────────────────────────────────────────────────────────────────
-- Per ogni tavolata: `_close_seating_unchecked(id, 'auto')`, cioè gli STESSI
-- effetti della chiusura dell'operatore (lock per sede, prenotazioni `seated`
-- → `completed`). Il predicato `status = 'open'` dentro il cuore rende la
-- passata sicura anche se l'host chiude la stessa tavolata nello stesso
-- istante: uno dei due la trova già chiusa e non tocca niente.
--
-- `closed_at` è l'ora della passata, NON l'ora in cui il tavolo si è
-- liberato: per questo la UI esclude le `auto` dalle "Concluse" e nel drawer
-- dice che ha chiuso il sistema, invece di mostrare un orario inventato.
--
-- Niente tabella di log: il job è sincrono, e un errore finisce in
-- `cron.job_run_details` (status `failed` + messaggio). Il conteggio
-- restituito NON ci arriva: `return_message` è il command tag della SELECT
-- (`1 row`), verificato live il 2026-09-15. La traccia vera è
-- `closed_reason = 'auto'` sulla tabella, che è più forte di un log: una
-- query per sede dice cosa è stato chiuso, quando, e se da qualche parte
-- stiamo chiudendo troppo presto — senza chiedere niente a nessuno.
-- =============================================================================

CREATE FUNCTION public.close_stale_seatings()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_boundary timestamptz := public.get_service_day_start();
    v_id       uuid;
    v_closed   integer := 0;
BEGIN
    FOR v_id IN
        SELECT s.id
          FROM public.seatings s
         WHERE s.status = 'open'
           AND s.opened_at < v_boundary
         ORDER BY s.activity_id, s.opened_at
    LOOP
        -- Conta solo se è stata davvero questa passata a chiuderla: la riga
        -- torna `closed` con `closed_reason = 'auto'` SOLO se l'UPDATE del
        -- cuore è passato. Se l'ha chiusa l'operatore un attimo prima, il
        -- motivo è `operator` e non è nostra.
        IF (public._close_seating_unchecked(v_id, 'auto')).closed_reason = 'auto' THEN
            v_closed := v_closed + 1;
        END IF;
    END LOOP;

    RETURN v_closed;
END;
$$;
