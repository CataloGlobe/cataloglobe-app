-- =============================================================================
-- claim_pending_notification_emails — claim atomico per send-notification-emails
-- =============================================================================
--
-- Coda delle email del motore notifiche (`notification_emails`, mig
-- 20261015010000). Modellata su claim_pending_print_jobs:
--   1. Statement 1 — cap poison PRIMA del claim: i 'processing' stantii
--      (claimed_at NULL o oltre soglia) con attempts >= p_max_attempts vanno a
--      'failed'.
--   2. Statement 2 — claim FIFO con FOR UPDATE SKIP LOCKED: i 'pending' con
--      run_after passato (i nuovi tentativi aspettano il loro turno) e i
--      'processing' orfani sotto il cap. Ogni presa incrementa attempts e
--      valorizza claimed_at.
--
-- ⚠️ SYNC: le stesse condizioni stanno nel comando del cron
-- `process-notification-emails` (20261015020200). Se cambia qui, nuova
-- migration che rifà il comando con cron.alter_job.
--
-- NB 42702: colonne qualificate con alias (e / e2): `id`, `attempts`, ...
-- collidono con gli output del RETURNS TABLE.
--
-- Grant nel file successivo (regola 42601).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_pending_notification_emails(
    p_limit INTEGER,
    p_max_attempts INTEGER DEFAULT 3,
    p_reclaim_after_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    tenant_id UUID,
    to_email TEXT,
    event_type TEXT,
    template TEXT,
    data JSONB,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Statement 1 — termina i poison PRIMA del claim.
    UPDATE public.notification_emails AS e
    SET status = 'failed',
        last_error = 'reclaim cap: max attempts reached (orphaned processing)'
    WHERE e.status = 'processing'
      AND (
          e.claimed_at IS NULL
          OR e.claimed_at < now() - make_interval(mins => p_reclaim_after_minutes)
      )
      AND e.attempts >= p_max_attempts;

    -- Statement 2 — claim: pending maturi + reclaim orfani under-cap.
    RETURN QUERY
    UPDATE public.notification_emails e
    SET status = 'processing',
        attempts = e.attempts + 1,
        claimed_at = now()
    WHERE e.id IN (
        SELECT e2.id
        FROM public.notification_emails e2
        WHERE (
              (e2.status = 'pending' AND e2.run_after <= now())
              OR (
                  e2.status = 'processing'
                  AND (
                      e2.claimed_at IS NULL
                      OR e2.claimed_at < now() - make_interval(mins => p_reclaim_after_minutes)
                  )
                  AND e2.attempts < p_max_attempts
              )
          )
        ORDER BY e2.created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING e.id, e.user_id, e.tenant_id, e.to_email, e.event_type, e.template, e.data, e.attempts;
END;
$$;
