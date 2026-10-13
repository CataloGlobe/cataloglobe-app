-- 20261013180000_drop_status_incidents_anon_read.sql
--
-- Seguito di 20261013170000_drop_legacy_status_page.sql. La pagina /status
-- legge gli incidenti da GET /api/status (api/status/index.ts) col service
-- role, e /api/admin/status-incidents li scrive col service role: entrambi
-- bypassano RLS. Nessun client legge status_incidents con anon o
-- authenticated, quindi la policy di lettura pubblica creata da
-- 20260520220000_create_status_tables.sql non serve più.
--
-- RLS resta abilitato: senza policy, nessun accesso da anon/authenticated.

DROP POLICY IF EXISTS "status_incidents public read" ON public.status_incidents;
