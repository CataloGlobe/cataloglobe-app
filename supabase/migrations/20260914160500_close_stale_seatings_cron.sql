-- =============================================================================
-- CHIUSURA AUTOMATICA TAVOLATE — schedulazione pg_cron, SQL puro
-- =============================================================================
-- Ogni ora, al minuto 3: `SELECT public.close_stale_seatings();`
--
-- ── Perché SQL puro e non pg_net → Edge ────────────────────────────────────
-- Chiudere tavolate è lavoro interamente dentro il database: nessuna email,
-- nessuna chiamata esterna. `pg_net` è asincrono e un errore dall'altra
-- parte non torna indietro (è ciò che nella FASE 1 dei promemoria ha
-- nascosto un 504 per giorni). Qui il job è sincrono: un errore finisce in
-- `cron.job_run_details` (status `failed`). Il conteggio invece NO —
-- `return_message` è il command tag della SELECT (`1 row`): la traccia è
-- `closed_reason = 'auto'` in `seatings`.
-- Stesso pattern di `expire-old-invites` (20260313070000) e
-- `expire-tenant-trials` (20260907194739).
--
-- ── Perché ogni ora e non una volta al giorno ──────────────────────────────
-- Il confine (l'ultima cinque del mattino trascorsa, Europe/Rome —
-- `get_service_day_start`, 20260914155000) rende la passata sicura a
-- qualunque ora: alle 00:30 le tavolate della notte in corso sono DOPO il
-- confine e restano intatte. Ogni passata chiude tutto ciò che lo ha
-- superato, e se una salta la successiva rimedia da sola. Nessuna finestra
-- di recupero da gestire. Una passata è un UPDATE su una manciata di righe.
--
-- Il cron parla UTC: `3 * * * *` gira ogni ora, il minuto è scelto per non
-- coincidere con gli altri job orari (`0 * * * *`, `10 * * * *`).
--
-- Idempotente: unschedule-then-schedule, come gli altri job del progetto.
--
-- Controllo:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'close-stale-seatings';
--   SELECT status, return_message, end_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'close-stale-seatings')
--    ORDER BY end_time DESC LIMIT 5;
--   SELECT activity_id, count(*), max(closed_at) FROM public.seatings
--    WHERE closed_reason = 'auto' GROUP BY 1;
-- =============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'close-stale-seatings') THEN
        PERFORM cron.unschedule('close-stale-seatings');
    END IF;
END $$;

SELECT cron.schedule(
    'close-stale-seatings',
    '3 * * * *',
    'SELECT public.close_stale_seatings();'
);
