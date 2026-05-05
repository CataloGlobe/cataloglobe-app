-- =============================================================================
-- Translation progress RPCs
-- =============================================================================
-- Espone 2 RPC al frontend per il widget di progress nella pagina Settings →
-- Lingue:
--
--   1. get_translation_progress(p_tenant_id)
--      Aggrega translation_jobs per (tenant, target_language_code, status) e
--      ritorna JSONB con counts pending/done/error/total per lingua + totali.
--
--   2. retry_all_failed_translations(p_tenant_id)
--      Re-imposta i job in status='failed' a 'pending' così il cron li
--      riprende. Reset di last_error e attempts. Ritorna count righe aggiornate.
--
-- Mapping status:
--   DB enum: ('pending','processing','done','failed')
--   Output JSON usa chiave 'error' per coerenza con la semantica UI: il
--   frontend non distingue tra 'failed' e 'processing' fallito, mostra
--   solo "errori da riprovare".
--
-- Sicurezza:
--   SECURITY DEFINER per bypassare RLS di translation_jobs (lookup cross-row
--   per aggregazione). Defense-in-depth: verifica che auth.uid() sia membro
--   attivo del tenant via public.tenant_memberships. RAISE EXCEPTION
--   altrimenti.
--
--   search_path = '' obbligatorio + qualifiche public.* esplicite.
--   REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE TO authenticated.
--
-- Performance:
--   Index parziale translation_jobs_pending_idx esistente copre solo
--   status='pending'. Per la query GROUP BY (tenant_id, target_language_code,
--   status) aggiungiamo index composito su (tenant_id, target_language_code,
--   status). Cheap, IF NOT EXISTS, idempotente.
-- =============================================================================


-- 1. INDEX -------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS translation_jobs_progress_idx
    ON public.translation_jobs (tenant_id, target_language_code, status);


-- 2. RPC get_translation_progress -------------------------------------------

CREATE OR REPLACE FUNCTION public.get_translation_progress(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_result jsonb;
BEGIN
    -- Membership check: utente authenticated deve essere membro del tenant.
    -- Defense-in-depth: la RPC bypassa RLS, ma vogliamo bloccare cross-tenant.
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id
            USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'by_lang',       COALESCE(jsonb_agg(lang_stats ORDER BY lang), '[]'::jsonb),
        'total_pending', COALESCE(SUM((lang_stats->>'pending')::int), 0),
        'total_error',   COALESCE(SUM((lang_stats->>'error')::int),   0),
        'total_done',    COALESCE(SUM((lang_stats->>'done')::int),    0)
    )
    INTO v_result
    FROM (
        SELECT
            target_language_code AS lang,
            jsonb_build_object(
                'lang',    target_language_code,
                'pending', COUNT(*) FILTER (WHERE status IN ('pending','processing')),
                'done',    COUNT(*) FILTER (WHERE status = 'done'),
                'error',   COUNT(*) FILTER (WHERE status = 'failed'),
                'total',   COUNT(*)
            ) AS lang_stats
        FROM public.translation_jobs
        WHERE tenant_id = p_tenant_id
        GROUP BY target_language_code
    ) lang_grouped;

    RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_translation_progress(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_translation_progress(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_translation_progress(uuid) IS
'Aggrega translation_jobs per tenant raggruppato per target_language_code. '
'Ritorna JSONB { by_lang: [{lang, pending, done, error, total}], '
'total_pending, total_error, total_done }. Status DB ''failed'' mappato a '
'chiave JSON ''error''. Status ''processing'' contato come ''pending''. '
'SECURITY DEFINER + membership check via tenant_memberships.';


-- 3. RPC retry_all_failed_translations --------------------------------------

CREATE OR REPLACE FUNCTION public.retry_all_failed_translations(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_count integer;
BEGIN
    -- Membership check.
    IF NOT EXISTS (
        SELECT 1
        FROM public.tenant_memberships
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Access denied to tenant %', p_tenant_id
            USING ERRCODE = '42501';
    END IF;

    UPDATE public.translation_jobs
    SET status     = 'pending',
        last_error = NULL,
        attempts   = 0
    WHERE tenant_id = p_tenant_id
      AND status = 'failed';

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.retry_all_failed_translations(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.retry_all_failed_translations(uuid) TO authenticated;

COMMENT ON FUNCTION public.retry_all_failed_translations(uuid) IS
'Resetta tutti i translation_jobs status=''failed'' del tenant a ''pending'', '
'azzerando last_error e attempts. Il cron li riprende al prossimo ciclo. '
'Ritorna count righe aggiornate. SECURITY DEFINER + membership check.';
