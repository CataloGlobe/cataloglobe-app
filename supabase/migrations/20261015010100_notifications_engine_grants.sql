BEGIN;

-- =============================================================================
-- MOTORE DELLE NOTIFICHE: privilegi e cron di pulizia
-- =============================================================================
-- Separato da 20261015010000 per il limite di `db push` (SQLSTATE 42601).

-- notify e prune: solo service role (edge) e altre funzioni DEFINER.
REVOKE ALL ON FUNCTION public.notify(text, jsonb, uuid, jsonb, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify(text, jsonb, uuid, jsonb, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify(text, jsonb, uuid, jsonb, text, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.prune_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.prune_notifications() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_notifications() TO service_role;

-- notification_render è pura (niente tabelle): resta eseguibile, serve solo
-- dentro notify. La togliamo comunque ad anon.
REVOKE ALL ON FUNCTION public.notification_render(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notification_render(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.notification_render(text, jsonb) TO authenticated, service_role;

-- Catalogo: lettura per gli utenti del back office, nessuna scrittura.
REVOKE ALL ON TABLE public.notification_types FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.notification_types FROM authenticated;
GRANT SELECT ON TABLE public.notification_types TO authenticated;

-- Preferenze: solo le proprie (RLS), niente anon.
REVOKE ALL ON TABLE public.notification_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_preferences TO authenticated;

-- Coda email: di piattaforma, nessun accesso dal client.
REVOKE ALL ON TABLE public.notification_emails FROM anon, authenticated;

-- Cron di pulizia, ogni notte alle 03:40 UTC.
DO $cron$
DECLARE
    v_job_id integer;
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'prune-notifications'
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
        'prune-notifications',
        '40 3 * * *',
        'SELECT public.prune_notifications();'
    );
END;
$cron$;

COMMIT;
