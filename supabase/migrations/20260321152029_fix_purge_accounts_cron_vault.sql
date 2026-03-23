-- Remove existing job
DO $$
DECLARE
    v_job_id int;
BEGIN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'purge_accounts_daily'
    LIMIT 1;

    IF v_job_id IS NOT NULL THEN
        PERFORM cron.unschedule(v_job_id);
    END IF;
END;
$$;

-- Recreate job using Vault
SELECT cron.schedule(
    'purge_accounts_daily',
    '0 3 * * *',
    $job$
    DO $$
    DECLARE
        v_url text := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'purge_accounts_url'
            LIMIT 1
        );

        v_secret text := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'purge_accounts_secret'
            LIMIT 1
        );
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type',  'application/json',
                'x-purge-secret', v_secret
            ),
            body    := '{"dry_run": false}'::jsonb
        );
    END;
    $$;
    $job$
);