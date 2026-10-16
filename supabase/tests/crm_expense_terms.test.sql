-- =============================================================================
-- CRM, costi: test di conti, cambi di prezzo e rimborsi (20261016120000/120100)
--
-- NON è una migration. Non vive in supabase/migrations/ e non viene applicato
-- da `supabase db push`.
--
-- ── COSA VERIFICA ───────────────────────────────────────────────────────────
--   1  mensile 10 € dal 31/01, term 20 € dal 31/03: gen e feb a 10, mar e apr a 20
--   2  term con valid_from = giorno di un addebito: quell'addebito è già nuovo
--   3  annuale dal 15/01, term a metà anno (01/07): il 2027 è al prezzo nuovo,
--      il 2026 no
--   4  disdetta: nessun addebito dalla data di disdetta, anche con un term
--   5  renewals_due con un term futuro sul prossimo addebito: prezzo nuovo
--   6  term su una una tantum → 22023
--   7  term prima o uguale al primo addebito → 22023
--   8  nome del conto con 16 cifre → rifiutato (CHECK)
--   9  conto personale senza titolare → rifiutato (CHECK)
--  10  una tantum: importo invariato anche con terms altrove
--  11  authenticated non admin: zero righe da terms, refunds, accounts
--  12  ACL: authenticated non esegue renewals_due né la funzione di trigger
--  13  first_charge_on spostato dopo un term: il primo addebito resta amount_cents
--
-- ── DOVE ESEGUIRLO ──────────────────────────────────────────────────────────
-- Supabase Studio → SQL Editor, sul progetto STAGING. MAI in produzione.
-- Da eseguire DOPO 20261016120000 e 20261016120100.
-- Il risultato è l'ultima SELECT: una riga per caso, `ok` deve essere true.
-- Tutto dentro BEGIN … ROLLBACK: nessuna riga sopravvive. Se interrompi a
-- metà, esegui `ROLLBACK;` a mano prima di altro.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE t_results (n int, what text, ok boolean, detail text) ON COMMIT DROP;
GRANT ALL ON t_results TO authenticated;

DO $$
DECLARE
    v_m   uuid;  -- mensile
    v_y   uuid;  -- annuale
    v_c   uuid;  -- disdetto
    v_o   uuid;  -- una tantum
    v_r   uuid;  -- con promemoria
    v_got text;
    v_ok  boolean;
BEGIN
    -- 1 ---------------------------------------------------------------------
    INSERT INTO public.crm_expenses (kind, name, amount_cents, first_charge_on, billing_interval)
    VALUES ('subscription', 'test mensile', 1000, '2026-01-31', 'month') RETURNING id INTO v_m;
    INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
    VALUES (v_m, '2026-03-31', 2000);

    SELECT string_agg(r_charged_on || '=' || r_amount_cents, ' ' ORDER BY r_charged_on) INTO v_got
    FROM public.crm_expense_charges('2026-04-30') WHERE r_expense_id = v_m;
    INSERT INTO t_results VALUES (1, 'prezzo nuovo solo da marzo',
        v_got = '2026-01-31=1000 2026-02-28=1000 2026-03-31=2000 2026-04-30=2000', v_got);

    -- 2 ---------------------------------------------------------------------
    INSERT INTO t_results
    SELECT 2, 'term dal giorno di un addebito vale già su quello',
        r_amount_cents = 2000, r_charged_on || '=' || r_amount_cents
    FROM public.crm_expense_charges('2026-04-30')
    WHERE r_expense_id = v_m AND r_charged_on = '2026-03-31';

    -- 3 ---------------------------------------------------------------------
    INSERT INTO public.crm_expenses (kind, name, amount_cents, first_charge_on, billing_interval)
    VALUES ('subscription', 'test annuale', 14400, '2026-01-15', 'year') RETURNING id INTO v_y;
    INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
    VALUES (v_y, '2026-07-01', 18000);

    SELECT string_agg(r_charged_on || '=' || r_amount_cents, ' ' ORDER BY r_charged_on) INTO v_got
    FROM public.crm_expense_charges('2027-12-31') WHERE r_expense_id = v_y;
    INSERT INTO t_results VALUES (3, 'annuale: cambia dall''anniversario',
        v_got = '2026-01-15=14400 2027-01-15=18000', v_got);

    -- 4 ---------------------------------------------------------------------
    INSERT INTO public.crm_expenses (kind, name, amount_cents, first_charge_on, billing_interval, cancelled_on)
    VALUES ('subscription', 'test disdetto', 1000, '2026-01-10', 'month', '2026-03-10') RETURNING id INTO v_c;
    INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
    VALUES (v_c, '2026-02-10', 1500);

    SELECT string_agg(r_charged_on || '=' || r_amount_cents, ' ' ORDER BY r_charged_on) INTO v_got
    FROM public.crm_expense_charges('2026-06-30') WHERE r_expense_id = v_c;
    INSERT INTO t_results VALUES (4, 'disdetta: niente dal giorno della disdetta',
        v_got = '2026-01-10=1000 2026-02-10=1500', v_got);

    -- 5 ---------------------------------------------------------------------
    INSERT INTO public.crm_expenses (kind, name, amount_cents, first_charge_on, billing_interval, remind_days_before)
    VALUES ('subscription', 'test promemoria', 1000, '2026-01-20', 'month', 3) RETURNING id INTO v_r;
    INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
    VALUES (v_r, '2026-05-20', 3000);

    SELECT r_next_charge_on || '=' || r_amount_cents INTO v_got
    FROM public.crm_expense_renewals_due('2026-05-18') WHERE r_expense_id = v_r;
    INSERT INTO t_results VALUES (5, 'promemoria col prezzo del prossimo addebito',
        v_got = '2026-05-20=3000', v_got);

    -- 6 ---------------------------------------------------------------------
    INSERT INTO public.crm_expenses (kind, name, amount_cents, paid_on)
    VALUES ('one_off', 'test una tantum', 5000, '2026-02-01') RETURNING id INTO v_o;
    BEGIN
        INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
        VALUES (v_o, '2026-03-01', 100);
        INSERT INTO t_results VALUES (6, 'term su una tantum rifiutato', false, 'accettato');
    EXCEPTION WHEN SQLSTATE '22023' THEN
        INSERT INTO t_results VALUES (6, 'term su una tantum rifiutato', true, SQLERRM);
    END;

    -- 7 ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.crm_expense_terms (expense_id, valid_from, amount_cents)
        VALUES (v_m, '2026-01-31', 100);
        INSERT INTO t_results VALUES (7, 'term sul primo addebito rifiutato', false, 'accettato');
    EXCEPTION WHEN SQLSTATE '22023' THEN
        INSERT INTO t_results VALUES (7, 'term sul primo addebito rifiutato', true, SQLERRM);
    END;

    -- 8 ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.crm_expense_accounts (name, kind) VALUES ('Carta 1234567812345678', 'joint');
        INSERT INTO t_results VALUES (8, 'numero di carta nel nome rifiutato', false, 'accettato');
    EXCEPTION WHEN check_violation THEN
        INSERT INTO t_results VALUES (8, 'numero di carta nel nome rifiutato', true, SQLERRM);
    END;

    -- 9 ---------------------------------------------------------------------
    BEGIN
        INSERT INTO public.crm_expense_accounts (name, kind) VALUES ('test personale', 'personal');
        INSERT INTO t_results VALUES (9, 'conto personale senza titolare rifiutato', false, 'accettato');
    EXCEPTION WHEN check_violation THEN
        INSERT INTO t_results VALUES (9, 'conto personale senza titolare rifiutato', true, SQLERRM);
    END;

    -- 10 --------------------------------------------------------------------
    SELECT string_agg(r_charged_on || '=' || r_amount_cents, ' ') INTO v_got
    FROM public.crm_expense_charges('2026-12-31') WHERE r_expense_id = v_o;
    INSERT INTO t_results VALUES (10, 'una tantum invariata', v_got = '2026-02-01=5000', v_got);

    -- 13 --------------------------------------------------------------------
    UPDATE public.crm_expenses SET first_charge_on = '2026-04-30' WHERE id = v_m;
    SELECT string_agg(r_charged_on || '=' || r_amount_cents, ' ' ORDER BY r_charged_on) INTO v_got
    FROM public.crm_expense_charges('2026-05-31') WHERE r_expense_id = v_m;
    INSERT INTO t_results VALUES (13, 'primo addebito spostato dopo un term: prezzo base',
        v_got = '2026-04-30=1000 2026-05-30=1000', v_got);

    -- Righe da nascondere al caso 11.
    INSERT INTO public.crm_expense_accounts (name, kind) VALUES ('test comune', 'joint');
    INSERT INTO public.crm_expense_refunds (expense_id, refunded_on, amount_cents) VALUES (v_m, '2026-04-02', 500);

    -- 12 --------------------------------------------------------------------
    v_ok := NOT has_function_privilege('authenticated', 'public.crm_expense_renewals_due(date)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.crm_expense_terms_check()', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.crm_expense_charges(date)', 'EXECUTE');
    INSERT INTO t_results VALUES (12, 'ACL delle funzioni', v_ok, NULL);
END;
$$;

-- 11 ------------------------------------------------------------------------
-- Un utente qualsiasi, non admin di piattaforma.
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO t_results
SELECT 11, 'non admin non legge le tabelle nuove',
    (SELECT count(*) FROM public.crm_expense_terms) = 0
    AND (SELECT count(*) FROM public.crm_expense_refunds) = 0
    AND (SELECT count(*) FROM public.crm_expense_accounts) = 0,
    NULL;
RESET ROLE;

SELECT n, what, ok, detail FROM t_results ORDER BY n;

ROLLBACK;
