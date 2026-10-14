BEGIN;

-- =============================================================================
-- NOTIFICHE ATTIVITÀ IN ELIMINAZIONE: privilegi e cron dei promemoria
-- =============================================================================
-- Separato da 20261015030000 per il limite di `db push` (SQLSTATE 42601).

-- Tutto solo service role: le chiamano delete-tenant, restore-tenant e il cron.
REVOKE ALL ON FUNCTION public.tenant_purge_at(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_purge_at(timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_purge_at(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.tenant_deletion_notification_data(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_deletion_notification_data(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_deletion_notification_data(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.notify_tenant_deletion_scheduled(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_tenant_deletion_scheduled(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_tenant_deletion_scheduled(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.remind_tenant_deletions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remind_tenant_deletions() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.remind_tenant_deletions() TO service_role;

REVOKE ALL ON FUNCTION public.notify_tenant_restored(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_tenant_restored(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_tenant_restored(uuid, uuid) TO service_role;

-- Promemoria a 7 e 1 giorno: ogni giorno alle 07:30 UTC (mattina in Italia).
-- Solo SQL, nessuna chiamata HTTP: le email partono dalla coda.
DO $cron$
DECLARE
    v_job_id integer;
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'remind-tenant-deletions'
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
        'remind-tenant-deletions',
        '30 7 * * *',
        'SELECT public.remind_tenant_deletions();'
    );
END;
$cron$;

COMMIT;
