-- Split da 20260720224101 per il workaround db push (SQLSTATE 42601:
-- CREATE FUNCTION multi-statement + REVOKE nello stesso file).
--
-- La function è invocabile solo dal trigger machinery su INSERT auth.users
-- (le funzioni trigger non sono chiamabili via SELECT diretto — Postgres lo
-- impedisce strutturalmente). REVOKE comunque per coerenza col pattern
-- "SECURITY DEFINER in public → REVOKE esplicito da PUBLIC/anon/authenticated"
-- (Supabase pre-grant di default ai ruoli nominati sopravvive al REVOKE FROM
-- PUBLIC da solo).

REVOKE EXECUTE ON FUNCTION public.block_disposable_email_signup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_disposable_email_signup() FROM anon;
REVOKE EXECUTE ON FUNCTION public.block_disposable_email_signup() FROM authenticated;
