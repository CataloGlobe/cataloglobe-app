-- =============================================================================
-- Test: la conferma della registrazione scrive la verifica OTP (30 giorni)
--
-- NON è una migration. Si lancia a mano su staging dopo la migration
-- 20261009120000_signup_confirm_counts_as_otp.sql, dentro una transazione
-- che si annulla da sola: non lascia utenti né righe.
--
--   1  conferma (email_confirmed_at NULL → now)     → riga con scadenza a 30 giorni
--   2  utente creato già confermato                  → nessuna riga
--   3  update di altri campi su utente confermato    → la riga non si sposta
--   4  conferma con una verifica vecchia già presente → scadenza rinnovata
--   5  authenticated e anon non eseguono la funzione
-- =============================================================================
BEGIN;

DO $$
DECLARE
  u_new uuid := gen_random_uuid();
  u_pre uuid := gen_random_uuid();
  u_old uuid := gen_random_uuid();
  v_exp timestamptz;
  v_exp2 timestamptz;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  VALUES
    (u_new, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-otp-new@example.invalid', NULL, now(), now()),
    (u_pre, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-otp-pre@example.invalid', now(), now(), now()),
    (u_old, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-otp-old@example.invalid', NULL, now(), now());

  -- 1
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = u_new;
  SELECT expires_at INTO v_exp FROM public.otp_user_verifications WHERE user_id = u_new;
  IF v_exp IS NULL OR abs(extract(epoch FROM (v_exp - (now() + interval '30 days')))) > 5 THEN
    RAISE EXCEPTION 'caso 1: verifica mancante o scadenza sbagliata (%)', v_exp;
  END IF;

  -- 2
  IF EXISTS (SELECT 1 FROM public.otp_user_verifications WHERE user_id = u_pre) THEN
    RAISE EXCEPTION 'caso 2: utente creato confermato ha ricevuto la verifica';
  END IF;

  -- 3
  UPDATE public.otp_user_verifications SET expires_at = now() + interval '1 day' WHERE user_id = u_new;
  UPDATE auth.users SET updated_at = now(), email_confirmed_at = email_confirmed_at WHERE id = u_new;
  SELECT expires_at INTO v_exp2 FROM public.otp_user_verifications WHERE user_id = u_new;
  IF abs(extract(epoch FROM (v_exp2 - (now() + interval '1 day')))) > 5 THEN
    RAISE EXCEPTION 'caso 3: la riga si è spostata senza una conferma nuova (%)', v_exp2;
  END IF;

  -- 4
  INSERT INTO public.otp_user_verifications (user_id, verified_at, expires_at)
  VALUES (u_old, now() - interval '40 days', now() - interval '10 days');
  UPDATE auth.users SET email_confirmed_at = now() WHERE id = u_old;
  SELECT expires_at INTO v_exp FROM public.otp_user_verifications WHERE user_id = u_old;
  IF abs(extract(epoch FROM (v_exp - (now() + interval '30 days')))) > 5 THEN
    RAISE EXCEPTION 'caso 4: scadenza non rinnovata (%)', v_exp;
  END IF;

  -- 5
  IF has_function_privilege('authenticated', 'public.signup_confirm_counts_as_otp()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.signup_confirm_counts_as_otp()', 'EXECUTE') THEN
    RAISE EXCEPTION 'caso 5: la funzione è eseguibile da anon o authenticated';
  END IF;

  RAISE NOTICE 'signup_confirm_counts_as_otp: 5 casi su 5 ok';
END;
$$;

ROLLBACK;
