-- =============================================================================
-- claim_pending_print_jobs v2 — aggiunge kind al RETURNS TABLE
-- =============================================================================
--
-- Identica alla v1 (20260907210100), con `kind` aggiunto a RETURNS TABLE e al
-- RETURNING finale. Nessuna modifica alla logica di claim/reclaim/cap poison:
-- process-print-jobs deve solo sapere COSA stampare per ogni job claimato.
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
    kind TEXT,
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
              j.kind,
              j.attempts;
END;
$$;

COMMENT ON FUNCTION public.claim_pending_print_jobs(INTEGER, INTEGER, INTEGER) IS
    'Atomic claim di N print_jobs con FOR UPDATE SKIP LOCKED. Pesca i pending '
    'e ripesca i processing orfani (claimed_at oltre p_reclaim_after_minutes o '
    'NULL) sotto p_max_attempts, incrementando attempts e valorizzando '
    'claimed_at. PRIMA del claim manda a failed i processing stantii che hanno '
    'gia'' raggiunto p_max_attempts. v2 (blocco 3a): ritorna anche kind '
    '(comanda|annullo) cosi'' lo sweeper sa cosa stampare. Chiamata solo '
    'dall''edge function process-print-jobs (service_role).';
