-- Gate anti-abuso: rifiuta la creazione di un account (auth.users) se il
-- dominio dell'email è nella blacklist public.disposable_domains (vedi
-- migration gemella 20260720224100_seed_disposable_domains.sql).
--
-- Trigger SERVER-SIDE su auth.users: blocca QUALSIASI path di creazione
-- utente (supabase.auth.signUp() dal frontend, admin API, OAuth, ecc.),
-- non solo il flusso sign-up dell'app. Non aggirabile lato client.
--
-- Match sul dominio ESATTO dopo lowercase+trim (split_part su '@') e sui
-- suoi domini genitori (sottodominio bloccato se il genitore è listato —
-- stesso criterio di src/utils/validateEmail.ts:isDisposableEmailDomain).
-- Qui è il gate autoritativo; quello client resta un nicety UX (lista più
-- piccola, feedback immediato prima del round-trip di rete).
--
-- SECURITY DEFINER: la tabella disposable_domains ha RLS enabled senza
-- policy (deny-all per anon/authenticated) — il trigger deve poter
-- leggerla con l'identità dell'owner. SET search_path TO '' + tabella
-- qualificata public.disposable_domains.

CREATE OR REPLACE FUNCTION public.block_disposable_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_domain text;
  v_labels text[];
  v_candidate text;
  i int;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_domain := lower(trim(split_part(NEW.email, '@', 2)));

  IF v_domain = '' THEN
    RETURN NEW;
  END IF;

  v_labels := string_to_array(v_domain, '.');

  -- Prova il dominio pieno e ogni suo genitore (es. a.b.mailinator.com →
  -- a.b.mailinator.com, poi b.mailinator.com, poi mailinator.com), ma mai
  -- il solo TLD finale (i < array_length - 1).
  FOR i IN 1 .. array_length(v_labels, 1) - 1 LOOP
    v_candidate := array_to_string(v_labels[i : array_length(v_labels, 1)], '.');

    IF EXISTS (
      SELECT 1 FROM public.disposable_domains d WHERE d.domain = v_candidate
    ) THEN
      RAISE EXCEPTION 'disposable_email_domain'
        USING ERRCODE = 'P0001',
              MESSAGE = 'disposable_email_domain',
              HINT = 'Usa un indirizzo email permanente per registrarti.';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_disposable_email_signup ON auth.users;

CREATE TRIGGER trg_block_disposable_email_signup
BEFORE INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.block_disposable_email_signup();
