-- =============================================================================
-- get_service_day_start() — l'ultima cinque del mattino trascorsa (Europe/Rome)
-- =============================================================================
-- Il confine della GIORNATA DI SERVIZIO della sala: una tavolata aperta prima
-- di questo istante appartiene a un servizio passato. Lo leggono in due —
-- `close_stale_seatings` (che chiude) e la schermata Servizio (che segnala) —
-- e devono leggere la stessa cosa, per questo è una funzione e non
-- un'espressione inline.
--
-- ── Perché NON get_operative_day_start() ───────────────────────────────────
-- Quella è la giornata di CALENDARIO (mezzanotte Europe/Rome): giusta per i
-- KPI, i promemoria, lo Storico. La sala non finisce a mezzanotte: un locale
-- che chiude alle 02:00 ha, alle 00:30, tavolate vive e legittime. Con la
-- mezzanotte come confine il cron le chiuderebbe in mezzo al servizio e il
-- segnale le marcherebbe "di ieri". Le cinque del mattino sono l'ora in cui,
-- in Italia e in questo settore, non c'è più nessuno in sala.
--
-- ── Il numero ──────────────────────────────────────────────────────────────
-- Le cinque sono l'unico valore inventato di questa fase, e stanno SOLO qui
-- lato SQL. Il giorno in cui un locale reale servirà oltre le cinque, il
-- valore diventa una colonna su `activities` con 5 come default, e questa
-- funzione (o chi la chiama) la legge. Nessuna impostazione per sede finché
-- quel locale non esiste: decisione presa nella FASE 2.8.
--
-- ── Il calcolo ─────────────────────────────────────────────────────────────
-- "Sposta l'orologio di Roma indietro di 5 ore e prendi la data": quella è la
-- giornata di servizio corrente, e il suo inizio è quella data alle 05:00,
-- riportata a istante. Wall-clock, quindi DST-aware come il resto dello
-- stack (stessa tecnica di get_operative_day_start, 20260601150000):
--   - now() AT TIME ZONE 'Europe/Rome'      → orologio di Roma, senza fuso
--   - - interval '5 hours', ::date          → la data di servizio
--   - + interval '5 hours'                  → le 05:00 di quella data
--   - AT TIME ZONE 'Europe/Rome'            → di nuovo un istante, col giusto
--                                             offset per QUELLA data
--
-- Esempi (ora di Roma):
--   00:30 → ieri  05:00      06:00 → oggi 05:00
--   03:00 → ieri  05:00      12:00 → oggi 05:00
--   04:59 → ieri  05:00      05:00 → oggi 05:00
--
-- ⚠️ SYNC: lo stesso confine, con la stessa regola dello spostamento di 5
-- ore, vive lato client in `src/pages/Dashboard/Reservations/serviceDay.ts`
-- (`SERVICE_DAY_START_HOUR`). Cambiare l'ora qui e non lì (o viceversa) fa
-- divergere il segnale dalla chiusura: modificarli nello stesso commit, come
-- `priceSummary.ts` e `scheduleResolver.ts`.
--
-- Puro calcolo: nessun accesso a tabelle. SECURITY INVOKER. Nessun ruolo
-- applicativo la chiama (ACL in 20260914155100).
--
-- TODO multi-region: quando `activities.iana_timezone` esisterà, il fuso va
-- parametrizzato qui come in get_operative_day_start.
-- =============================================================================

CREATE FUNCTION public.get_service_day_start()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO ''
AS $$
    SELECT (
        ((now() AT TIME ZONE 'Europe/Rome') - interval '5 hours')::date
        + interval '5 hours'
    ) AT TIME ZONE 'Europe/Rome';
$$;
