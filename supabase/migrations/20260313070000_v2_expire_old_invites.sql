BEGIN;

-- =========================================
-- V2: EXPIRE OLD INVITES — CLEANUP FUNCTION
-- =========================================

-- -----------------------------------------------------------------------
-- 1. Cleanup function
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_old_invites()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.v2_tenant_memberships
  SET status = 'expired'
  WHERE status = 'pending'
    AND invite_expires_at IS NOT NULL
    AND invite_expires_at < now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_old_invites() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_old_invites() TO service_role;


-- -----------------------------------------------------------------------
-- 2. pg_cron schedule
-- -----------------------------------------------------------------------
DO $cron$
DECLARE
  v_job_id integer;
BEGIN

  CREATE EXTENSION IF NOT EXISTS pg_cron;

  SELECT jobid
  INTO v_job_id
  FROM cron.job
  WHERE jobname = 'expire-old-invites'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'expire-old-invites',
    '0 0 * * *',
    'SELECT public.expire_old_invites();'
  );

EXCEPTION
  WHEN undefined_table OR undefined_function THEN
    RAISE NOTICE 'pg_cron not available — expire_old_invites() must be scheduled manually.';
END;
$cron$;

COMMIT;