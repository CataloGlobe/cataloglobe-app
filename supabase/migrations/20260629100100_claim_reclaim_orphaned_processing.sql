-- =============================================================================
-- FASE 2a / Migration B — reclaim orfani + cap poison nella claim
-- =============================================================================
--
-- Audit FASE 1: claim_pending_translation_jobs pescava SOLO status='pending'.
-- Un job lasciato in 'processing' da un tick morto (CPU/wall-clock kill, OOM,
-- restart) non veniva mai ripreso -> perso per sempre. Inoltre, un job "poison"
-- che uccide il tick verrebbe reclaimato all'infinito perche' il catch JS
-- dell'edge non gira quando il tick muore.
--
-- Fix (decisioni FASE 2):
--   1. Reclaim age-based: i 'processing' con claimed_at oltre soglia (o NULL =
--      orfano pre-colonna) tornano eleggibili.
--   2. Cap DB-side: i 'processing' stantii con attempts >= p_max_attempts vengono
--      mandati a 'failed' invece di essere riprocessati (statement 1, PRIMA del
--      claim). attempts e' pre-incremento dell'ultima presa, quindi il boundary
--      coincide con quello dell'edge (attempts < MAX -> retry, else fail).
--   3. Il reclaim incrementa attempts (una presa come un'altra) e valorizza
--      claimed_at.
--   4. claimed_at IS NULL su un 'processing' = immediatamente eleggibile.
--   5. p_max_attempts / p_reclaim_after_minutes con DEFAULT -> la chiamata edge
--      attuale (solo p_limit) resta valida: 2a e' indipendente da 2b. In 2b
--      l'edge passa il proprio MAX_ATTEMPTS via p_max_attempts (fonte autoritativa).
--
-- Cambio di firma (1 -> 3 argomenti): l'arieta' cambia, quindi CREATE OR REPLACE
-- NON sostituisce la funzione esistente ma ne creerebbe un OVERLOAD ambiguo
-- (`claim_pending_translation_jobs(integer)` non sarebbe piu' unica per la
-- chiamata a 1 argomento). Si DROPpa quindi la vecchia (integer); la nuova 3-arg
-- usa CREATE OR REPLACE cosi' il file e' ri-appliabile in modo idempotente
-- (re-apply su un ambiente che ha gia' la 3-arg -> REPLACE, grant preservati,
-- niente errore "function already exists", niente split 42601). Il DROP della
-- (integer) e' un no-op dove la 1-arg e' gia' sparita, ma DEVE restare per il
-- fresh-apply (prod): senza, la legacy 1-arg sopravvivrebbe accanto alla 3-arg
-- e la chiamata a 1 argomento tornerebbe ambigua. I grant vanno comunque
-- riemessi (REVOKE da PUBLIC/anon/authenticated, GRANT a service_role): su un
-- fresh-create i default Supabase concederebbero anon/authenticated.
--
-- SECURITY DEFINER + SET search_path TO '' invariati. make_interval e now()
-- risolvono da pg_catalog (sempre implicitamente in search_path) anche con
-- search_path vuoto: nessuna qualificazione necessaria, comportamento invariato.
--
-- NB 42702: nello statement 1 le colonne nel WHERE sono qualificate con l'alias
-- `j` perche' `attempts` collide con l'output omonimo del RETURNS TABLE (regola
-- r_/qualificazione di CLAUDE.md). Lo statement 2 usa gia' j/j2.
-- =============================================================================

DROP FUNCTION IF EXISTS public.claim_pending_translation_jobs(integer);

CREATE OR REPLACE FUNCTION public.claim_pending_translation_jobs(
    p_limit INTEGER,
    p_max_attempts INTEGER DEFAULT 3,
    p_reclaim_after_minutes INTEGER DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    tenant_id UUID,
    entity_type TEXT,
    entity_id TEXT,
    field TEXT,
    target_language_code TEXT,
    source_text TEXT,
    source_hash TEXT,
    attempts INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
    -- Statement 1 — termina i poison PRIMA del claim.
    -- Solo processing stantii (claimed_at oltre soglia, o NULL = orfano
    -- pre-colonna) che hanno gia' esaurito i tentativi. I processing recenti
    -- (claimed_at < soglia) non vengono toccati: potrebbero essere in volo.
    --
    -- Alias `j` + qualificazione delle colonne nel WHERE: senza alias, `attempts`
    -- collide con il parametro di output `attempts` del RETURNS TABLE (variabile
    -- in scope nel body plpgsql) -> ERROR 42702 "column reference is ambiguous"
    -- (stessa regola r_/qualificazione di CLAUDE.md, gia' incappata su
    -- get_tenant_members). I target della SET restano NON qualificati: Postgres
    -- vieta `j.col` a sinistra della SET, e status/processed_at/last_error non
    -- sono output del RETURNS TABLE quindi non collidono comunque.
    UPDATE public.translation_jobs AS j
    SET status = 'failed',
        processed_at = now(),
        last_error = 'reclaim cap: max attempts reached (orphaned processing)'
    WHERE j.status = 'processing'
      AND (
          j.claimed_at IS NULL
          OR j.claimed_at < now() - make_interval(mins => p_reclaim_after_minutes)
      )
      AND j.attempts >= p_max_attempts;

    -- Statement 2 — claim: pending + reclaim under-cap.
    -- Guard lingua attiva fattorizzata: vale per entrambi i rami (non
    -- reprocessare lingue disattivate). Job di sistema (tenant_id IS NULL)
    -- sempre eleggibili.
    RETURN QUERY
    UPDATE public.translation_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1,
        claimed_at = now()
    WHERE j.id IN (
        SELECT j2.id
        FROM public.translation_jobs j2
        WHERE (
              j2.tenant_id IS NULL
              OR EXISTS (
                  SELECT 1
                  FROM public.tenant_languages tl
                  WHERE tl.tenant_id = j2.tenant_id
                    AND tl.language_code = j2.target_language_code
                    AND tl.is_active = true
              )
          )
          AND (
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
              j.entity_type,
              j.entity_id,
              j.field,
              j.target_language_code,
              j.source_text,
              j.source_hash,
              j.attempts;
END;
$$;

COMMENT ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) IS
    'Atomic claim di N translation_jobs con FOR UPDATE SKIP LOCKED. Pesca i '
    'pending (guard lingua attiva) E ripesca i processing orfani/stantii '
    '(claimed_at oltre p_reclaim_after_minutes o NULL) sotto p_max_attempts, '
    'incrementando attempts e valorizzando claimed_at. PRIMA del claim manda a '
    'failed i processing stantii che hanno gia'' raggiunto p_max_attempts (cap '
    'poison). Chiamata solo dall''edge function process-translation-jobs '
    '(service_role).';

REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) TO service_role;
