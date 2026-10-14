-- 20261013170000_drop_legacy_status_page.sql
--
-- Pulizia della vecchia status page sul DB. Dal 03/10/2026 (PR #192) la
-- pagina /status legge storico e stato corrente da Redis via GET /api/status;
-- il DB resta solo come storico scritto dal service role (status_checks,
-- status_service_state) e fonte degli incidenti (status_incidents).
--
-- Tolti:
--   - get_daily_uptime(text, integer): aggregazione dei 90 giorni letta dal
--     browser (20260606130000_add_get_daily_uptime_rpc.sql). Nessun chiamante.
--   - policy "status_checks public read" (anon, authenticated), creata da
--     20260520220000_create_status_tables.sql. Il browser non legge più
--     status_checks; status-check e il ripiego degli avvisi usano il service
--     role, che bypassa RLS. RLS resta abilitato: senza policy, nessun
--     accesso da anon/authenticated.
--
-- Restano: la tabella status_checks e il pg_cron purge-status-checks
-- (cancella oltre 7 giorni), che sostituisce api/cron/status-prune.ts.

DROP FUNCTION IF EXISTS public.get_daily_uptime(text, integer);

DROP POLICY IF EXISTS "status_checks public read" ON public.status_checks;
