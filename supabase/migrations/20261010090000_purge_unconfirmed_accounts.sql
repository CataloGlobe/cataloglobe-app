-- =============================================================================
-- ACCOUNT MAI CONFERMATI — pulizia dopo 7 giorni, e codici OTP col loro account
-- =============================================================================
-- Decisione di Lorenzo (D30, 2026-10-09): chi si registra e non conferma
-- l'email entro 7 giorni viene cancellato. Serve a non lasciare account
-- sbagliati (es. un'email scritta male e poi corretta) che occupano l'indirizzo
-- e restano nel database per sempre.
--
-- 1. `otp_user_verifications` non aveva una FK verso `auth.users`: cancellando
--    un utente la sua riga restava orfana (5 righe su staging il 2026-10-09).
--    Si tolgono le orfane e si aggiunge la FK con ON DELETE CASCADE.
-- 2. `purge_unconfirmed_accounts()`: cancella da `auth.users` chi non ha mai
--    confermato l'email ed è registrato da più di 7 giorni. Le tabelle
--    collegate seguono da sole (profiles, otp_challenges, consent_records,
--    notifications: tutte ON DELETE CASCADE). Per prudenza salta chi ha fatto
--    almeno un accesso, chi possiede un'azienda (`tenants.owner_user_id` è
--    RESTRICT) e chi ha una membership: un account mai confermato non può
--    averne, ma se capitasse non deve sparire con i dati di un'azienda. Salta
--    anche chi ha un provider diverso da email e chi ha righe nelle altre due
--    FK RESTRICT (`crm_weekly_goals.set_by`, `crm_next_steps.set_by`): una sola
--    riga farebbe fallire tutta la DELETE, ogni notte.
-- 3. pg_cron ogni notte alle 3:40 UTC (gli altri job delle 3 sono a :00, :15,
--    :17, :29, :45). SQL puro e sincrono: un errore finisce in
--    `cron.job_run_details`, come `close-stale-seatings` (20260914160500).
--
-- Controllo:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'purge-unconfirmed-accounts';
--   SELECT status, return_message, end_time FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'purge-unconfirmed-accounts')
--    ORDER BY end_time DESC LIMIT 5;
--   SELECT count(*) FROM auth.users
--    WHERE email_confirmed_at IS NULL AND created_at < now() - interval '7 days';
-- =============================================================================

BEGIN;

-- 1. FK con cascade su otp_user_verifications ---------------------------------

DELETE FROM public.otp_user_verifications o
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = o.user_id);

ALTER TABLE public.otp_user_verifications
    ADD CONSTRAINT otp_user_verifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- 2. Funzione di pulizia -------------------------------------------------------

CREATE OR REPLACE FUNCTION public.purge_unconfirmed_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    removed integer;
BEGIN
    DELETE FROM auth.users u
    WHERE u.email_confirmed_at IS NULL
      AND u.email IS NOT NULL
      AND u.last_sign_in_at IS NULL
      AND u.created_at < now() - interval '7 days'
      AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.owner_user_id = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.tenant_memberships m WHERE m.user_id = u.id)
      -- Solo registrazioni con email e password: chi entra con un provider esterno
      -- non passa dalla conferma via codice.
      AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider <> 'email')
      -- FK RESTRICT verso auth.users: una sola riga bloccherebbe l'intera passata.
      AND NOT EXISTS (SELECT 1 FROM public.crm_weekly_goals g WHERE g.set_by = u.id)
      AND NOT EXISTS (SELECT 1 FROM public.crm_next_steps n WHERE n.set_by = u.id);

    GET DIAGNOSTICS removed = ROW_COUNT;
    RETURN removed;
END;
$$;

COMMENT ON FUNCTION public.purge_unconfirmed_accounts() IS
    'Cancella gli account mai confermati registrati da più di 7 giorni (D30). Solo pg_cron.';

REVOKE ALL ON FUNCTION public.purge_unconfirmed_accounts()
FROM PUBLIC, anon, authenticated, service_role;

-- 3. Schedulazione (idempotente: unschedule-then-schedule) ---------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-unconfirmed-accounts') THEN
        PERFORM cron.unschedule('purge-unconfirmed-accounts');
    END IF;
END $$;

SELECT cron.schedule(
    'purge-unconfirmed-accounts',
    '40 3 * * *',
    'SELECT public.purge_unconfirmed_accounts();'
);

COMMIT;
