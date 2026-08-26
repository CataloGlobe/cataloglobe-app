-- =============================================================================
-- translation_jobs — gate quota AI: TRIGGER BEFORE INSERT (FASE 4)
-- =============================================================================
--
-- Perché un trigger e non un check FE: le traduzioni si accodano da 3 path e il
-- principale (INSERT diretto da ~10 service FE via enqueueTranslationJobsIfChanged)
-- NON passa da alcuna edge. Un check server-side su INSERT è l'UNICO punto sotto
-- a TUTTI i path (INSERT client + RPC enqueue_tenant_language_backfill). Non
-- aggirabile dal client.
--
-- Cosa blocca: SOLO i NUOVI insert quando lo status quota del tenant è
-- 'blocked'/'not_eligible'. I job già 'pending'/'processing' proseguono (in-flight
-- finiscono, il menù non si spezza a metà) — il trigger è su INSERT, non su UPDATE.
-- Righe platform (tenant_id IS NULL, backfill piattaforma) sono ESENTI: fuori quota.
--
-- Requisito 1 — EFFICIENZA (un backfill inserisce centinaia di job in un colpo):
--   lo status quota si valuta UNA VOLTA per (tenant, transazione) via memoizzazione
--   su GUC transaction-local (set_config is_local=true). Un backfill single-tenant
--   di N righe fa UNA sola get_ai_usage_current_cycle, non N. Cambio tenant nella
--   stessa tx → ricalcolo (raro). Il get_ai_usage_current_cycle è STABLE e la
--   memo evita comunque l'aggregazione ripetuta su ai_usage_events.
--
-- Requisito 2 — DEGRADAZIONE CON GRAZIA: i ~10 service FE accodano in modalità
--   "silent error" (enqueueWithSilentError: try/catch che logga e ritorna 0).
--   L'operazione principale (salvare prodotto/categoria/…) è un INSERT/UPDATE
--   SEPARATO, già committato, PRIMA dell'enqueue. L'eccezione AI_QUOTA_EXHAUSTED
--   qui sollevata fa fallire solo l'INSERT del job, viene inghiottita dal wrapper
--   → il save utente riesce, la traduzione semplicemente non parte. (Audit dei
--   call site: tutti e 9 i service usano enqueueWithSilentError; nessun caller
--   diretto fragile. enqueueTranslationJobsBulk NON è wrappato ma non ha caller.)
--
-- SECURITY DEFINER: il trigger delega interamente a get_ai_usage_current_cycle
-- (che fa il proprio access check via get_my_tenant_ids/service_role); auth.uid()/
-- auth.role() restano quelli del chiamante reale anche sotto DEFINER.
--
-- Fail-CLOSED vs fail-OPEN: lo STATO è deciso dalla RPC. status IN
-- ('blocked','not_eligible') ⇒ blocco (include quota NULL/non configurata, che
-- la RPC risolve a 'blocked' — stato NOTO, non ignoranza). Un errore di
-- *valutazione* (la chiamata alla RPC solleva/timeout) propaga e aborta l'INSERT
-- del job — ma è a sua volta inghiottito da enqueueWithSilentError lato service,
-- quindi il save utente sopravvive comunque (la traduzione salta e basta).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.enforce_ai_quota_on_translation_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_status text;
    v_cached text;
BEGIN
    -- Righe platform: esenti da quota.
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Memoizzazione transaction-local: riusa lo status se già calcolato per
    -- questo tenant nella transazione corrente (backfill multi-riga).
    -- ⚠️ INVARIANTE DI SICUREZZA: queste GUC sono USERSET (caller-settable) e la
    -- cache si FIDA del loro valore = puro artificio di performance, NON un
    -- confine di sicurezza. È sicura solo perché nessun path client può settarle
    -- nella stessa tx dell'INSERT (set_config è in pg_catalog, non instradato da
    -- PostgREST; un INSERT REST è statement/tx singolo; nessuna RPC client-callable
    -- le tocca) → sulla 1ª riga di ogni tx client la cache è vuota e si valuta la
    -- RPC reale. L'invariante SI ROMPE se nascesse una RPC client-callable
    -- SECURITY DEFINER che interleava set_config(cataloglobe.aiq_*) + INSERT su
    -- translation_jobs nella stessa tx (forgerebbe status='ok', bypassando un
    -- 'blocked' reale). Fix in quel caso: carrier NON-USERSET / pg_temp.
    v_cached := current_setting('cataloglobe.aiq_tenant', true);
    IF v_cached IS NOT NULL AND v_cached = NEW.tenant_id::text THEN
        v_status := NULLIF(current_setting('cataloglobe.aiq_status', true), '');
    ELSE
        SELECT c.status INTO v_status
          FROM public.get_ai_usage_current_cycle(NEW.tenant_id) c;
        PERFORM set_config('cataloglobe.aiq_tenant', NEW.tenant_id::text, true);
        PERFORM set_config('cataloglobe.aiq_status', COALESCE(v_status, ''), true);
    END IF;

    IF v_status IN ('blocked', 'not_eligible') THEN
        RAISE EXCEPTION 'AI_QUOTA_EXHAUSTED'
            USING DETAIL  = format('tenant=%s status=%s', NEW.tenant_id, v_status),
                  HINT    = 'AI quota for the current billing cycle is exhausted; '
                            'new translation jobs are blocked until reset.',
                  ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_ai_quota_on_translation_job() IS
    'Gate quota AI su INSERT translation_jobs (FASE 4). Blocca i NUOVI job se '
    'lo status quota del tenant è blocked/not_eligible. Platform rows (tenant_id '
    'NULL) esenti. Status memoizzato per-transazione (GUC is_local) per efficienza '
    'sui backfill. Legge la fonte unica get_ai_usage_current_cycle.';

DROP TRIGGER IF EXISTS trg_enforce_ai_quota ON public.translation_jobs;
CREATE TRIGGER trg_enforce_ai_quota
    BEFORE INSERT ON public.translation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_ai_quota_on_translation_job();
