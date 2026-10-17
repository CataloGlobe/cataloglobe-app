-- =============================================================================
-- ⚠️ SOLO STAGING — NON ESEGUIRE IN PRODUZIONE (regola di supabase/tests).
-- Non usa dati: controlla i privilegi e prova UPDATE con WHERE false, quindi
-- nessuna riga viene letta o scritta.
-- =============================================================================
--
-- Test — order_items: cancelled_at / cancel_reason solo via RPC
--
-- Verifica (20261016200000):
--   1. anon e authenticated non hanno UPDATE di tabella né sulle due colonne
--   2. authenticated tiene l'UPDATE su tutte le altre colonne (come prima)
--   3. authenticated che scrive cancelled_at → 42501
--   4. authenticated che scrive cancel_reason → 42501
--   5. authenticated che scrive item_notes → nessun errore di privilegio
--   6. la strada giusta resta aperta: cancel_order_item_atomic è SECURITY
--      DEFINER, il suo owner aggiorna le due colonne, service_role la esegue
--      e authenticated no; service_role aggiorna le due colonne
--
-- Prima di 20261016200000 falliscono 1, 3 e 4.
--
-- Pattern: una transazione sola, ogni test fra SAVEPOINT t<N> e
-- ROLLBACK TO SAVEPOINT t<N>. Nello SQL Editor di Studio il BEGIN è solo un
-- WARNING («there is already a transaction in progress»).
--
-- Esecuzione: Studio SQL Editor di staging (ruolo postgres), il file intero.
-- Attesi 6 `NOTICE … OK`; un `Test N FAIL` interrompe il file.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Test 1 — niente UPDATE su tabella e sulle due colonne per anon/authenticated
-- -----------------------------------------------------------------------------
SAVEPOINT t1;
DO $$
DECLARE
    v_role text;
    v_column text;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF has_table_privilege(v_role, 'public.order_items', 'UPDATE') THEN
            RAISE EXCEPTION 'Test 1 FAIL: % ha ancora UPDATE di tabella su order_items', v_role;
        END IF;
        FOREACH v_column IN ARRAY ARRAY['cancelled_at', 'cancel_reason'] LOOP
            IF has_column_privilege(v_role, 'public.order_items', v_column, 'UPDATE') THEN
                RAISE EXCEPTION 'Test 1 FAIL: % può aggiornare order_items.%', v_role, v_column;
            END IF;
        END LOOP;
    END LOOP;
    RAISE NOTICE 'Test 1 OK: anon e authenticated senza UPDATE su tabella, cancelled_at e cancel_reason';
END
$$;
ROLLBACK TO SAVEPOINT t1;

-- -----------------------------------------------------------------------------
-- Test 2 — le altre colonne restano aggiornabili da authenticated
-- -----------------------------------------------------------------------------
SAVEPOINT t2;
DO $$
DECLARE
    v_missing text;
BEGIN
    SELECT string_agg(c.column_name, ', ')
      INTO v_missing
      FROM information_schema.columns c
     WHERE c.table_schema = 'public'
       AND c.table_name = 'order_items'
       AND c.column_name NOT IN ('cancelled_at', 'cancel_reason')
       AND NOT has_column_privilege('authenticated', 'public.order_items', c.column_name, 'UPDATE');

    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION 'Test 2 FAIL: authenticated ha perso UPDATE su %', v_missing;
    END IF;
    RAISE NOTICE 'Test 2 OK: authenticated aggiorna ancora tutte le altre colonne';
END
$$;
ROLLBACK TO SAVEPOINT t2;

-- -----------------------------------------------------------------------------
-- Test 3 — authenticated scrive cancelled_at → 42501
-- -----------------------------------------------------------------------------
SAVEPOINT t3;
SET LOCAL role authenticated;
DO $$
BEGIN
    BEGIN
        UPDATE public.order_items SET cancelled_at = now() WHERE false;
        RAISE EXCEPTION 'Test 3 FAIL: authenticated ha potuto scrivere cancelled_at';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Test 3 OK: cancelled_at diretto → 42501';
    END;
END
$$;
RESET role;
ROLLBACK TO SAVEPOINT t3;

-- -----------------------------------------------------------------------------
-- Test 4 — authenticated scrive cancel_reason → 42501
-- -----------------------------------------------------------------------------
SAVEPOINT t4;
SET LOCAL role authenticated;
DO $$
BEGIN
    BEGIN
        UPDATE public.order_items SET cancel_reason = 'test' WHERE false;
        RAISE EXCEPTION 'Test 4 FAIL: authenticated ha potuto scrivere cancel_reason';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'Test 4 OK: cancel_reason diretto → 42501';
    END;
END
$$;
RESET role;
ROLLBACK TO SAVEPOINT t4;

-- -----------------------------------------------------------------------------
-- Test 5 — authenticated scrive item_notes: nessun errore di privilegio
-- -----------------------------------------------------------------------------
SAVEPOINT t5;
SET LOCAL role authenticated;
DO $$
BEGIN
    UPDATE public.order_items SET item_notes = item_notes WHERE false;
    RAISE NOTICE 'Test 5 OK: item_notes resta aggiornabile';
EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Test 5 FAIL: authenticated ha perso UPDATE su item_notes';
END
$$;
RESET role;
ROLLBACK TO SAVEPOINT t5;

-- -----------------------------------------------------------------------------
-- Test 6 — la RPC di annullamento resta la strada aperta
-- -----------------------------------------------------------------------------
SAVEPOINT t6;
DO $$
DECLARE
    v_definer boolean;
    v_owner name;
    v_column text;
    v_fn constant text := 'public.cancel_order_item_atomic(uuid, uuid, text)';
BEGIN
    SELECT p.prosecdef, pg_get_userbyid(p.proowner)
      INTO v_definer, v_owner
      FROM pg_proc p
     WHERE p.oid = v_fn::regprocedure;

    IF NOT v_definer THEN
        RAISE EXCEPTION 'Test 6 FAIL: cancel_order_item_atomic non è SECURITY DEFINER';
    END IF;
    FOREACH v_column IN ARRAY ARRAY['cancelled_at', 'cancel_reason'] LOOP
        IF NOT has_column_privilege(v_owner, 'public.order_items', v_column, 'UPDATE') THEN
            RAISE EXCEPTION 'Test 6 FAIL: l''owner % della RPC non aggiorna %', v_owner, v_column;
        END IF;
        IF NOT has_column_privilege('service_role', 'public.order_items', v_column, 'UPDATE') THEN
            RAISE EXCEPTION 'Test 6 FAIL: service_role non aggiorna %', v_column;
        END IF;
    END LOOP;
    IF NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'Test 6 FAIL: service_role non esegue la RPC';
    END IF;
    IF has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION 'Test 6 FAIL: authenticated esegue la RPC direttamente';
    END IF;
    RAISE NOTICE 'Test 6 OK: RPC DEFINER di %, service_role la esegue, authenticated no', v_owner;
END
$$;
ROLLBACK TO SAVEPOINT t6;

ROLLBACK;
