-- =============================================================================
-- claim_pending_print_jobs — claim atomico per lo sweeper process-print-jobs
-- =============================================================================
--
-- Modellata su claim_pending_translation_jobs (20260629100100):
--   1. Statement 1 — cap poison PRIMA del claim: i 'processing' stantii
--      (claimed_at oltre soglia o NULL) con attempts >= p_max_attempts vanno a
--      'failed'. Evita il reclaim infinito di un job che uccide il tick.
--   2. Statement 2 — claim FIFO con FOR UPDATE SKIP LOCKED: pende i 'pending'
--      E ripesca i 'processing' orfani under-cap. Ogni presa incrementa
--      attempts e valorizza claimed_at.
--
-- Il push inline da submit-order inserisce il job direttamente in
-- 'processing' con claimed_at=now() e attempts=1: cosi' lo sweeper (ogni
-- minuto) NON lo ripesca mentre la chiamata Sunmi e' ancora in volo (finestra
-- p_reclaim_after_minutes, default 5). Se il push inline fallisce, l'edge
-- riporta il job a 'pending' e lo sweeper lo riprende al tick successivo.
--
-- NB 42702: colonne del WHERE qualificate con alias (j / j2) perche'
-- `attempts`, `id`, `tenant_id`, ... collidono con gli output del RETURNS
-- TABLE (regola r_/qualificazione di CLAUDE.md).
--
-- Grant nel file successivo (regola 42601: CREATE FUNCTION + REVOKE/GRANT
-- nello stesso file fa fallire `supabase db push`).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_pending_print_jobs(
    p_limit INTEGER,
    p_max_attempts INTEGER DEFAULT 3,
    p_reclaim_after_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    activity_id UUID,
    order_id UUID,
    printer_id UUID,
    trade_no TEXT,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Statement 1 — termina i poison PRIMA del claim.
    UPDATE public.print_jobs AS j
    SET status = 'failed',
        processed_at = now(),
        last_error = 'reclaim cap: max attempts reached (orphaned processing)'
    WHERE j.status = 'processing'
      AND (
          j.claimed_at IS NULL
          OR j.claimed_at < now() - make_interval(mins => p_reclaim_after_minutes)
      )
      AND j.attempts >= p_max_attempts;

    -- Statement 2 — claim: pending + reclaim orfani under-cap.
    RETURN QUERY
    UPDATE public.print_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1,
        claimed_at = now()
    WHERE j.id IN (
        SELECT j2.id
        FROM public.print_jobs j2
        WHERE (
              j2.status = 'pending'
              OR (
                  j2.status = 'processing'
                  AND (
                      j2.claimed_at IS NULL
                      OR j2.claimed_at < now() - make_interval(mins => p_reclaim_after_minutes)
                  )
                  AND j2.attempts < p_max_attempts
              )
          )
        ORDER BY j2.created_at ASC
        LIMIT p_limit
        FOR UPDATE SKIP LOCKED
    )
    RETURNING j.id,
              j.tenant_id,
              j.activity_id,
              j.order_id,
              j.printer_id,
              j.trade_no,
              j.attempts;
END;
$$;

COMMENT ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) IS
    'Atomic claim di N print_jobs con FOR UPDATE SKIP LOCKED. Pesca i pending '
    'e ripesca i processing orfani (claimed_at oltre p_reclaim_after_minutes o '
    'NULL) sotto p_max_attempts, incrementando attempts e valorizzando '
    'claimed_at. PRIMA del claim manda a failed i processing stantii che hanno '
    'gia'' raggiunto p_max_attempts. Chiamata solo dall''edge function '
    'process-print-jobs (service_role).';
