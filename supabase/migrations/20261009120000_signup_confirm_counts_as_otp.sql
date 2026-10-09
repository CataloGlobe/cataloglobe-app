-- La conferma della registrazione vale come verifica OTP per 30 giorni.
--
-- Deciso da Lorenzo il 2026-10-09: la mail di registrazione porta un codice e
-- un link; con l'uno o con l'altro si entra subito, senza login e senza un
-- secondo codice. Il codice o il link arrivano alla stessa casella che l'OTP
-- di accesso controlla, quindi la prova è la stessa.
--
-- Quando GoTrue conferma l'email (email_confirmed_at da NULL a valorizzato)
-- si scrive la riga in otp_user_verifications con la stessa scadenza della
-- edge function verify-otp (30 giorni). È nella stessa transazione della
-- conferma: quando il client riceve la sessione la riga c'è già.
--
-- Solo UPDATE e solo il passaggio NULL → valorizzato: gli utenti creati già
-- confermati (admin API, inviti con email_confirm) non ricevono la verifica e
-- fanno l'OTP al primo accesso come oggi. Un cambio email non tocca
-- email_confirmed_at, quindi non passa di qui.
--
-- SECURITY DEFINER: otp_user_verifications non ha policy di scrittura (solo
-- service_role e le funzioni SECURITY DEFINER). search_path vuoto e nomi
-- qualificati, come le altre funzioni OTP.

CREATE OR REPLACE FUNCTION public.signup_confirm_counts_as_otp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  INSERT INTO public.otp_user_verifications (user_id, verified_at, expires_at)
  VALUES (NEW.id, now(), now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE
    SET verified_at = EXCLUDED.verified_at,
        expires_at = EXCLUDED.expires_at;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_confirm_counts_as_otp() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.signup_confirm_counts_as_otp() FROM anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_email_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_email_confirmed
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
  EXECUTE FUNCTION public.signup_confirm_counts_as_otp();
