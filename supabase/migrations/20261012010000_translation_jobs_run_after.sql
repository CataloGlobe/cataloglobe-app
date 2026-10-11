-- =============================================================================
-- Traduzioni con attesa: un lavoro accodato dal back office parte solo dopo
-- 10 minuti senza altre modifiche a quel testo; «Traduci ora» lo anticipa.
--
-- Decisione di Lorenzo del 2026-10-11: le traduzioni non partono più a ogni
-- salvataggio (ritocchi in serie e prodotti di prova ritraducevano ogni volta,
-- consumando quota e coda). Scartati «solo su richiesta» e attesa di 24 ore:
-- lascerebbero i piatti nuovi in italiano.
--
--   1. translation_jobs.run_after: il lavoro non parte prima di questo istante.
--      Default now(): i lavori già in coda partono come prima.
--   2. translation_debounce_interval(): unico posto per i 10 minuti.
--   3. Trigger trg_translation_jobs_debounce: quando a scrivere è il client
--      (current_user = 'authenticated', cioè i servizi del back office via
--      PostgREST) un pending nuovo, o un pending a cui cambia source_hash,
--      riceve run_after = now() + 10 min. Le RPC SECURITY DEFINER (recupero di
--      una lingua, ritenta i falliti, revert del manuale, translate_now) girano
--      come proprietario: nessuna attesa, sono scelte esplicite.
--   4. claim_pending_translation_jobs: i pending solo con run_after <= now().
--   5. Comando del cron process-translation-jobs: stessa condizione.
--   6. translate_now(): porta a now() i pending in attesa dell'azienda, tutti o
--      quelli di un'entità.
--   7. get_translation_coverage: classe 'waiting' e next_run_at per lingua.
--
-- ⚠️ SYNC: le condizioni del claim (4) e del comando del cron (5) devono
-- restare uguali (CLAUDE.md, «Comandi cron ↔ funzioni di claim»).
-- La lista delle unità traducibili in (7) è la stessa di
-- enqueue_tenant_language_backfill e get_stale_translations.
-- =============================================================================

-- 1. Colonna ------------------------------------------------------------------

ALTER TABLE public.translation_jobs
    ADD COLUMN IF NOT EXISTS run_after TIMESTAMPTZ NOT NULL DEFAULT now();

COMMENT ON COLUMN public.translation_jobs.run_after IS
    'Il lavoro pending non viene preso dal claim prima di questo istante. '
    'Il trigger trg_translation_jobs_debounce lo sposta a now() + '
    'translation_debounce_interval() quando il client accoda o cambia il testo; '
    'translate_now() lo riporta a now().';

CREATE INDEX IF NOT EXISTS translation_jobs_pending_run_after_idx
    ON public.translation_jobs (run_after)
    WHERE status = 'pending';

-- 2. Intervallo di attesa -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.translation_debounce_interval()
RETURNS INTERVAL
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $$
    SELECT interval '10 minutes';
$$;

COMMENT ON FUNCTION public.translation_debounce_interval() IS
    'Attesa tra l''ultima modifica di un testo e la sua traduzione automatica '
    '(decisione di Lorenzo del 2026-10-11). Unico posto per il valore.';

-- 3. Trigger di attesa --------------------------------------------------------
-- SECURITY INVOKER (default) di proposito: current_user deve essere il ruolo
-- di chi scrive, non il proprietario della funzione.

CREATE OR REPLACE FUNCTION public.translation_jobs_debounce()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status = 'pending' THEN
            NEW.run_after := now() + public.translation_debounce_interval();
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.status = 'pending'
       AND NEW.source_hash IS DISTINCT FROM OLD.source_hash THEN
        NEW.run_after := now() + public.translation_debounce_interval();
    ELSE
        -- Il client non può anticipare un lavoro scrivendo run_after a mano,
        -- nemmeno passando da un altro stato (pending → failed col run_after
        -- nel passato → pending): per quello c'è translate_now(). «Riprova»
        -- (failed → pending, stesso hash) riparte subito perché il run_after
        -- di un job già eseguito è nel passato.
        NEW.run_after := OLD.run_after;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.translation_jobs_debounce() IS
    'Trigger BEFORE INSERT OR UPDATE su translation_jobs: se scrive il client '
    '(authenticated) un pending nuovo o con source_hash cambiato riceve '
    'run_after = now() + translation_debounce_interval(). Le RPC SECURITY '
    'DEFINER non ricevono attesa.';

DROP TRIGGER IF EXISTS trg_translation_jobs_debounce ON public.translation_jobs;
CREATE TRIGGER trg_translation_jobs_debounce
    BEFORE INSERT OR UPDATE ON public.translation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.translation_jobs_debounce();

-- 4. Claim ----------------------------------------------------------------------
-- Identica a 20260629100100 salvo la condizione run_after sui pending.

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
              (j2.status = 'pending' AND j2.run_after <= now())
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
    'pending con run_after scaduto (guard lingua attiva) E ripesca i processing '
    'orfani/stantii (claimed_at oltre p_reclaim_after_minutes o NULL) sotto '
    'p_max_attempts, incrementando attempts e valorizzando claimed_at. PRIMA '
    'del claim manda a failed i processing stantii che hanno gia'' raggiunto '
    'p_max_attempts (cap poison). Chiamata solo dall''edge function '
    'process-translation-jobs (service_role). ⚠️ SYNC con il comando del cron '
    'process-translation-jobs (20261012010000).';

REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER, INTEGER, INTEGER) TO service_role;

-- 5. Comando del cron -----------------------------------------------------------
-- Identico a 20260930160100 salvo run_after <= now() sui pending. Schedule
-- invariato.

DO $migration$
DECLARE
    v_jobid bigint;
BEGIN
    SELECT jobid
      INTO v_jobid
      FROM cron.job
     WHERE jobname = 'process-translation-jobs';

    IF v_jobid IS NULL THEN
        RAISE NOTICE 'cron job process-translation-jobs not found, skip alter';
        RETURN;
    END IF;

    PERFORM cron.alter_job(
        job_id  := v_jobid,
        command := $job$
    DO $$
    DECLARE
        v_url TEXT;
        v_secret TEXT;
    BEGIN
        IF NOT EXISTS (
            SELECT 1
            FROM public.translation_jobs j
            WHERE j.status = 'processing'
              AND (
                  j.claimed_at IS NULL
                  OR j.claimed_at < now() - interval '5 minutes'
              )
        )
        AND NOT EXISTS (
            SELECT 1
            FROM public.translation_jobs j
            WHERE j.status = 'pending'
              AND j.run_after <= now()
              AND (
                  j.tenant_id IS NULL
                  OR EXISTS (
                      SELECT 1
                      FROM public.tenant_languages tl
                      WHERE tl.tenant_id = j.tenant_id
                        AND tl.language_code = j.target_language_code
                        AND tl.is_active = true
                  )
              )
        ) THEN
            RETURN;
        END IF;

        v_url := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_translation_jobs_url'
            LIMIT 1
        );
        v_secret := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'translation_job_secret'
            LIMIT 1
        );

        IF v_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'process-translation-jobs cron: vault secrets mancanti, skip';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type',   'application/json',
                'X-Job-Secret',   v_secret
            ),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
    );
END;
$migration$;

-- 6. translate_now ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.translate_now(
    p_tenant_id UUID,
    p_entity_type TEXT DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Stesso perimetro di chi oggi può accodare (policy translation_jobs_insert):
    -- anticipare lavori già prenotati non costa più del farli partire dopo.
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id
            USING ERRCODE = '42501';
    END IF;

    IF (p_entity_type IS NULL) <> (p_entity_id IS NULL) THEN
        RAISE EXCEPTION 'p_entity_type e p_entity_id vanno passati insieme'
            USING ERRCODE = '22023';
    END IF;

    UPDATE public.translation_jobs j
    SET run_after = now()
    WHERE j.tenant_id = p_tenant_id
      AND j.status = 'pending'
      AND j.run_after > now()
      AND (
          p_entity_type IS NULL
          OR (j.entity_type = p_entity_type AND j.entity_id = p_entity_id)
      );

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.translate_now(UUID, TEXT, TEXT) IS
    '«Traduci ora»: porta a now() i translation_jobs pending in attesa '
    'dell''azienda, tutti o solo quelli di (p_entity_type, p_entity_id). Il cron '
    'li prende entro 30 secondi. Ritorna quanti lavori ha anticipato. '
    'SECURITY DEFINER + appartenenza all''azienda.';

REVOKE EXECUTE ON FUNCTION public.translate_now(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.translate_now(UUID, TEXT, TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION public.translate_now(UUID, TEXT, TEXT) TO authenticated;

-- 7. get_translation_coverage -------------------------------------------------------
-- Identica a 20260623120000 salvo: classe 'waiting' (pending con run_after
-- futuro, nessun lavoro in corso) prima di 'pending', che resta «in corso
-- adesso»; per lingua anche 'waiting' e 'next_run_at' (il primo run_after fra
-- le sole unità in 'waiting'). Le unità restano quelle di 20260623120000:
-- note e attributi accodati con altri entity_type non sono contati (come
-- oggi per 'pending').

CREATE OR REPLACE FUNCTION public.get_translation_coverage(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT (p_tenant_id IN (SELECT public.get_my_tenant_ids())) THEN
        RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id
            USING ERRCODE = '42501';
    END IF;

    WITH active_langs AS (
        SELECT tl.language_code
        FROM public.tenant_languages tl
        WHERE tl.tenant_id = p_tenant_id
          AND tl.is_active = true
    ),
    units AS (
        SELECT 'product'::text AS entity_type, p.id::text AS entity_id,
               'description'::text AS field, p.description_hash AS source_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.description IS NOT NULL AND p.description_hash IS NOT NULL
        UNION ALL
        SELECT 'product', p.id::text, 'notes', p.notes_hash
        FROM public.products p
        WHERE p.tenant_id = p_tenant_id
          AND p.notes IS NOT NULL AND p.notes_hash IS NOT NULL
        UNION ALL
        SELECT 'category', c.id::text, 'name', c.name_hash
        FROM public.catalog_categories c
        WHERE c.tenant_id = p_tenant_id
          AND c.name IS NOT NULL AND c.name_hash IS NOT NULL
        UNION ALL
        SELECT 'ingredient', i.id::text, 'name', i.name_hash
        FROM public.ingredients i
        WHERE i.tenant_id = p_tenant_id
          AND i.name IS NOT NULL AND i.name_hash IS NOT NULL
        UNION ALL
        SELECT 'option_group', og.id::text, 'name', og.name_hash
        FROM public.product_option_groups og
        WHERE og.tenant_id = p_tenant_id
          AND og.name IS NOT NULL AND og.name_hash IS NOT NULL
        UNION ALL
        SELECT 'option_value', ov.id::text, 'name', ov.name_hash
        FROM public.product_option_values ov
        WHERE ov.tenant_id = p_tenant_id
          AND ov.name IS NOT NULL AND ov.name_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'title', f.title_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.title IS NOT NULL AND f.title_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'subtitle', f.subtitle_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.subtitle IS NOT NULL AND f.subtitle_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'description', f.description_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.description IS NOT NULL AND f.description_hash IS NOT NULL
        UNION ALL
        SELECT 'featured', f.id::text, 'cta_text', f.cta_text_hash
        FROM public.featured_contents f
        WHERE f.tenant_id = p_tenant_id
          AND f.cta_text IS NOT NULL AND f.cta_text_hash IS NOT NULL
        UNION ALL
        SELECT 'closure', ac.id::text, 'label', ac.label_hash
        FROM public.activity_closures ac
        WHERE ac.tenant_id = p_tenant_id
          AND ac.label IS NOT NULL AND ac.label_hash IS NOT NULL
    ),
    classified AS (
        SELECT
            al.language_code,
            CASE
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = al.language_code
                      AND (
                          tj.status = 'processing'
                          OR (tj.status = 'pending' AND tj.run_after <= now())
                      )
                ) THEN 'pending'
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = al.language_code
                      AND tj.status = 'pending'
                ) THEN 'waiting'
                WHEN EXISTS (
                    SELECT 1 FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.entity_type = u.entity_type
                      AND t.entity_id = u.entity_id
                      AND t.field = u.field
                      AND t.language_code = al.language_code
                      AND t.source_hash = u.source_hash
                ) THEN 'fresh'
                WHEN EXISTS (
                    SELECT 1 FROM public.translation_jobs tj
                    WHERE tj.tenant_id = p_tenant_id
                      AND tj.entity_type = u.entity_type
                      AND tj.entity_id = u.entity_id
                      AND tj.field = u.field
                      AND tj.target_language_code = al.language_code
                      AND tj.status = 'failed'
                ) THEN 'failed'
                WHEN EXISTS (
                    SELECT 1 FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.entity_type = u.entity_type
                      AND t.entity_id = u.entity_id
                      AND t.field = u.field
                      AND t.language_code = al.language_code
                ) THEN 'stale'
                ELSE 'missing'
            END AS klass,
            (
                SELECT MIN(tj.run_after)
                FROM public.translation_jobs tj
                WHERE tj.tenant_id = p_tenant_id
                  AND tj.entity_type = u.entity_type
                  AND tj.entity_id = u.entity_id
                  AND tj.field = u.field
                  AND tj.target_language_code = al.language_code
                  AND tj.status = 'pending'
                  AND tj.run_after > now()
            ) AS waiting_at
        FROM active_langs al
        CROSS JOIN units u
    ),
    agg AS (
        SELECT
            al.language_code,
            COUNT(c.klass)                                  AS total,
            COUNT(*) FILTER (WHERE c.klass = 'fresh')       AS fresh,
            COUNT(*) FILTER (WHERE c.klass = 'stale')       AS stale,
            COUNT(*) FILTER (WHERE c.klass = 'pending')     AS pending,
            COUNT(*) FILTER (WHERE c.klass = 'waiting')     AS waiting,
            COUNT(*) FILTER (WHERE c.klass = 'failed')      AS failed,
            COUNT(*) FILTER (WHERE c.klass = 'missing')     AS missing,
            -- Solo dalle unità contate in 'waiting': «partono tra X min» si
            -- riferisce sempre a un lavoro che il numero comprende.
            MIN(c.waiting_at) FILTER (WHERE c.klass = 'waiting') AS next_run_at
        FROM active_langs al
        LEFT JOIN classified c ON c.language_code = al.language_code
        GROUP BY al.language_code
    )
    SELECT COALESCE(
        jsonb_object_agg(
            a.language_code,
            jsonb_build_object(
                'total',        a.total,
                'fresh',        a.fresh,
                'stale',        a.stale,
                'pending',      a.pending,
                'waiting',      a.waiting,
                'failed',       a.failed,
                'missing',      a.missing,
                'next_run_at',  a.next_run_at,
                'last_updated', (
                    SELECT MAX(t.updated_at)
                    FROM public.translations t
                    WHERE t.tenant_id = p_tenant_id
                      AND t.language_code = a.language_code
                )
            )
        ),
        '{}'::jsonb
    )
    INTO v_result
    FROM agg a;

    RETURN v_result;
END;
$$;
