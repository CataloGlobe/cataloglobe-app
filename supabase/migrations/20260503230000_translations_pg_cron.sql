-- =============================================================================
-- pg_cron schedule per process-translation-jobs (Prompt 7 di 24)
-- =============================================================================
--
-- Crea:
--   1. RPC claim_pending_translation_jobs — atomic claim batch con FOR UPDATE
--      SKIP LOCKED. Marca processing + attempts++. Solo service_role può
--      eseguire (chiamata dall'edge function).
--   2. Schedule pg_cron 'process-translation-jobs' ogni 2 minuti che invoca
--      l'edge function con header X-Job-Secret.
--
-- PRECONDIZIONI (utente deve fare PRIMA di applicare):
--   1. Inserire in vault.secrets via Dashboard SQL Editor:
--        - 'process_translation_jobs_url'  = '{SUPABASE_URL}/functions/v1/process-translation-jobs'
--        - 'translation_job_secret'        = stesso valore di TRANSLATION_JOB_SECRET env edge function
--      Esempio:
--        SELECT vault.create_secret(
--          '{SUPABASE_URL}/functions/v1/process-translation-jobs',
--          'process_translation_jobs_url'
--        );
--        SELECT vault.create_secret('<random-32-hex>', 'translation_job_secret');
--   2. Configurare secrets edge function (Settings → Edge Functions → Secrets):
--        - DEEPL_API_KEY              (key DeepL Free, formato xxx:fx)
--        - TRANSLATION_JOB_SECRET     (stesso valore del vault sopra)
--        - TRANSLATION_PROVIDER       ('mock' INIZIALE per smoke test fase A)
--   3. Deploy edge function:
--        supabase functions deploy process-translation-jobs --project-ref <ref>
--
-- Pattern vault confermato dalle migration esistenti:
--   - 20260315180000_v2_purge_tenants_cron.sql
--   - 20260321152029_fix_purge_accounts_cron_vault.sql
--
-- Ref: docs/translations-architecture-v3.md sez. 6.3.
-- =============================================================================


-- 1. RPC claim_pending_translation_jobs --------------------------------------

CREATE OR REPLACE FUNCTION public.claim_pending_translation_jobs(p_limit INTEGER)
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
    RETURN QUERY
    UPDATE public.translation_jobs j
    SET status = 'processing',
        attempts = j.attempts + 1
    WHERE j.id IN (
        SELECT j2.id
        FROM public.translation_jobs j2
        WHERE j2.status = 'pending'
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

COMMENT ON FUNCTION public.claim_pending_translation_jobs(INTEGER) IS
    'Atomic claim di N pending translation_jobs con FOR UPDATE SKIP LOCKED. '
    'Marca i job come processing + incrementa attempts in una sola transazione. '
    'Chiamata solo dall''edge function process-translation-jobs (service_role).';

REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_pending_translation_jobs(INTEGER) TO service_role;


-- 2. Schedule pg_cron --------------------------------------------------------
--
-- Pattern vault: legge URL + secret da vault.decrypted_secrets. Coerente con
-- purge_accounts_daily / purge_tenants_daily (migration esistenti).
--
-- Cleanup di eventuale schedule preesistente per re-apply idempotente.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-translation-jobs') THEN
        PERFORM cron.unschedule('process-translation-jobs');
    END IF;
END $$;

SELECT cron.schedule(
    'process-translation-jobs',
    '*/2 * * * *',
    $job$
    DO $$
    DECLARE
        v_url TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'process_translation_jobs_url'
            LIMIT 1
        );
        v_secret TEXT := (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'translation_job_secret'
            LIMIT 1
        );
    BEGIN
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
