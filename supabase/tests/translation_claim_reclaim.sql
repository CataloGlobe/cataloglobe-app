-- =============================================================================
-- Characterization test — claim_pending_translation_jobs reclaim + poison cap
-- =============================================================================
--
-- FASE 2a. NON e' una migration: eseguire A MANO su staging (SQL editor / psql)
-- DOPO aver applicato:
--   - 20260629100000_translation_jobs_claimed_at.sql
--   - 20260629100100_claim_reclaim_orphaned_processing.sql
--
-- Tutto gira dentro UNA transazione che termina con ROLLBACK: nessun dato
-- persiste (fixture tenant + jobs spariscono). Idempotente/ripetibile.
-- Eseguire come ruolo con privilegi (postgres/owner): la claim e' SECURITY
-- DEFINER granted solo a service_role, ma owner/superuser bypassa il grant.
--
-- Esito atteso: una sequenza di "PASS: ..." via RAISE NOTICE e nessuna
-- eccezione. Il primo mismatch alza EXCEPTION e aborta (la tx e' comunque
-- scartata dal ROLLBACK finale).
--
-- NB: lo statement 1 (poison -> failed) della claim e' GLOBALE (nessun filtro
-- tenant): dentro questa tx puo' toccare processing over-cap di altri tenant,
-- ma il ROLLBACK scarta tutto. Le asserzioni guardano solo le fixture.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_tenant   UUID := '00000000-0000-4000-a000-0000000000aa';
    v_owner    UUID;
    -- job ids fissi per ri-SELECT post-claim
    j_pending          UUID := '00000000-0000-4000-b000-000000000001';
    j_stale_under_cap  UUID := '00000000-0000-4000-b000-000000000002';
    j_stale_over_cap   UUID := '00000000-0000-4000-b000-000000000003';
    j_recent           UUID := '00000000-0000-4000-b000-000000000004';
    j_null_claimed     UUID := '00000000-0000-4000-b000-000000000005';
    j_pending_inactive UUID := '00000000-0000-4000-b000-000000000006';
    j_stale_inactive   UUID := '00000000-0000-4000-b000-000000000007';
    r RECORD;
BEGIN
    -- owner_user_id FK -> auth.users: riusa un utente esistente
    SELECT id INTO v_owner FROM auth.users LIMIT 1;
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Nessun auth.users su staging: impossibile creare il fixture tenant';
    END IF;

    -- Fixture tenant isolato (nessun altro job -> p_limit non viene saturato
    -- da dati reali)
    INSERT INTO public.tenants (id, name, owner_user_id)
    VALUES (v_tenant, 'ZZ_FIXTURE_RECLAIM', v_owner);

    -- Lingue: 'en' attiva, 'de' inattiva per il fixture tenant
    INSERT INTO public.tenant_languages (tenant_id, language_code, is_active)
    VALUES (v_tenant, 'en', true), (v_tenant, 'de', false)
    ON CONFLICT (tenant_id, language_code)
        DO UPDATE SET is_active = EXCLUDED.is_active;

    -- ── Fixture jobs ─────────────────────────────────────────────────────────
    -- (target_language_code, status, attempts, claimed_at)
    -- created_at = 1 anno fa: la claim e' GLOBALE con ORDER BY created_at ASC
    -- LIMIT, quindi le fixture devono essere le piu' "vecchie" per non essere
    -- affamate da job reali piu' anziani presenti su staging.
    INSERT INTO public.translation_jobs
        (id, tenant_id, entity_type, entity_id, field, target_language_code,
         source_text, source_hash, status, attempts, claimed_at, created_at)
    VALUES
        -- 1. pending, lingua attiva -> deve essere claimato
        (j_pending, v_tenant, 'product', 'e1', 'description', 'en',
         's1', 'h1', 'pending', 0, NULL, now() - interval '1 year'),
        -- 2. processing stantio (10 min fa) sotto cap -> reclaimato
        (j_stale_under_cap, v_tenant, 'product', 'e2', 'description', 'en',
         's2', 'h2', 'processing', 1, now() - interval '10 minutes', now() - interval '1 year'),
        -- 3. processing stantio over-cap (attempts=3) -> failed (statement 1)
        (j_stale_over_cap, v_tenant, 'product', 'e3', 'description', 'en',
         's3', 'h3', 'processing', 3, now() - interval '10 minutes', now() - interval '1 year'),
        -- 4. processing recente (10 sec fa) -> intatto (potenzialmente in volo)
        (j_recent, v_tenant, 'product', 'e4', 'description', 'en',
         's4', 'h4', 'processing', 1, now() - interval '10 seconds', now() - interval '1 year'),
        -- 5. processing con claimed_at NULL (orfano pre-colonna) -> reclaimato
        (j_null_claimed, v_tenant, 'product', 'e5', 'description', 'en',
         's5', 'h5', 'processing', 0, NULL, now() - interval '1 year'),
        -- 6. pending lingua INATTIVA -> intatto (guard lingua)
        (j_pending_inactive, v_tenant, 'product', 'e6', 'description', 'de',
         's6', 'h6', 'pending', 0, NULL, now() - interval '1 year'),
        -- 7. processing stantio sotto cap ma lingua INATTIVA -> intatto
        (j_stale_inactive, v_tenant, 'product', 'e7', 'description', 'de',
         's7', 'h7', 'processing', 1, now() - interval '10 minutes', now() - interval '1 year');

    -- ── Esegui la claim ──────────────────────────────────────────────────────
    PERFORM public.claim_pending_translation_jobs(100, 3, 5);

    -- ── Asserzioni ───────────────────────────────────────────────────────────
    -- 1. pending -> processing, attempts 1, claimed_at valorizzato
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_pending;
    IF r.status <> 'processing' OR r.attempts <> 1 OR r.claimed_at IS NULL THEN
        RAISE EXCEPTION 'FAIL pending: status=% attempts=% claimed_at=%',
            r.status, r.attempts, r.claimed_at;
    END IF;
    RAISE NOTICE 'PASS: pending claimato (processing, attempts=1, claimed_at set)';

    -- 2. stale under-cap -> reclaimato: processing, attempts 2, claimed_at fresco
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_stale_under_cap;
    IF r.status <> 'processing' OR r.attempts <> 2
       OR r.claimed_at < now() - interval '1 minute' THEN
        RAISE EXCEPTION 'FAIL stale_under_cap: status=% attempts=% claimed_at=%',
            r.status, r.attempts, r.claimed_at;
    END IF;
    RAISE NOTICE 'PASS: stale under-cap reclaimato (processing, attempts=2, claimed_at refreshed)';

    -- 3. stale over-cap -> failed (statement 1), attempts invariato
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_stale_over_cap;
    IF r.status <> 'failed' OR r.attempts <> 3 OR r.processed_at IS NULL THEN
        RAISE EXCEPTION 'FAIL stale_over_cap: status=% attempts=% processed_at=%',
            r.status, r.attempts, r.processed_at;
    END IF;
    RAISE NOTICE 'PASS: stale over-cap fallito (failed, attempts=3, processed_at set)';

    -- 4. recente -> intatto: processing, attempts 1, claimed_at invariato
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_recent;
    IF r.status <> 'processing' OR r.attempts <> 1
       OR r.claimed_at < now() - interval '1 minute'
       OR r.claimed_at > now() - interval '5 seconds' THEN
        RAISE EXCEPTION 'FAIL recent: status=% attempts=% claimed_at=%',
            r.status, r.attempts, r.claimed_at;
    END IF;
    RAISE NOTICE 'PASS: processing recente intatto (processing, attempts=1, claimed_at invariato)';

    -- 5. claimed_at NULL -> reclaimato: processing, attempts 1, claimed_at set
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_null_claimed;
    IF r.status <> 'processing' OR r.attempts <> 1 OR r.claimed_at IS NULL THEN
        RAISE EXCEPTION 'FAIL null_claimed: status=% attempts=% claimed_at=%',
            r.status, r.attempts, r.claimed_at;
    END IF;
    RAISE NOTICE 'PASS: orfano claimed_at NULL reclaimato (processing, attempts=1, claimed_at set)';

    -- 6. pending lingua inattiva -> intatto
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_pending_inactive;
    IF r.status <> 'pending' OR r.attempts <> 0 OR r.claimed_at IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL pending_inactive: status=% attempts=% claimed_at=%',
            r.status, r.attempts, r.claimed_at;
    END IF;
    RAISE NOTICE 'PASS: pending lingua inattiva intatto (pending, attempts=0)';

    -- 7. stale under-cap lingua inattiva -> intatto (guard applicata al reclaim)
    SELECT * INTO r FROM public.translation_jobs WHERE id = j_stale_inactive;
    IF r.status <> 'processing' OR r.attempts <> 1 THEN
        RAISE EXCEPTION 'FAIL stale_inactive: status=% attempts=%',
            r.status, r.attempts;
    END IF;
    RAISE NOTICE 'PASS: stale lingua inattiva NON reclaimato (processing, attempts=1)';

    RAISE NOTICE '== ALL CHARACTERIZATION ASSERTIONS PASSED ==';
END $$;

ROLLBACK;
