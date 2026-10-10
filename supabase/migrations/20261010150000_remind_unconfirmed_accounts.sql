-- =============================================================================
-- ACCOUNT MAI CONFERMATI — promemoria dopo 2 giorni
-- =============================================================================
-- Decisione di Lorenzo (2026-10-10): chi si registra e non conferma l'email
-- riceve una mail dopo 2 giorni che gli ricorda di farlo e gli dice quando
-- l'account verrà cancellato (7 giorni, `purge_unconfirmed_accounts`,
-- 20261010090000). Una mail sola per account.
--
-- 1. `signup_reminders`: una riga per account a cui il promemoria è partito.
--    Cascade su auth.users: quando la pulizia cancella l'account sparisce
--    anche la riga. RLS accesa senza policy: solo service_role.
-- 2. `claim_signup_reminders(p_limit)`: sceglie chi va avvisato (registrato
--    da più di 2 giorni e da meno di 7, mai confermato, stessi filtri della
--    pulizia), scrive la riga e restituisce email e data di registrazione.
--    Scrivere prima di mandare evita il doppio invio se il job parte due
--    volte; se l'invio fallisce la funzione edge cancella la riga e si
--    riprova il giorno dopo.
-- 3. pg_cron ogni giorno alle 8:00 UTC (di giorno, non di notte: è una mail
--    che si legge). Chiama la funzione edge `remind-unconfirmed-accounts` con
--    `internal_edge_secret` e `edge_functions_base_url` del vault, già
--    presenti su staging e prod (20260530090000): niente segreti nuovi.
--
-- Controllo:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'remind-unconfirmed-accounts';
--   SELECT count(*) FROM public.signup_reminders;
--   SELECT count(*) FROM auth.users
--    WHERE email_confirmed_at IS NULL
--      AND created_at < now() - interval '2 days' AND created_at > now() - interval '7 days';
-- =============================================================================

BEGIN;

-- 1. Tabella ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.signup_reminders (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    sent_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.signup_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.signup_reminders FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.signup_reminders IS
    'Promemoria di conferma email già mandati (uno per account). Solo service_role.';

-- 2. Scelta dei destinatari -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.claim_signup_reminders(p_limit integer DEFAULT 200)
RETURNS TABLE (user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH due AS (
        SELECT u.id, u.email::text AS email, u.created_at
        FROM auth.users u
        WHERE u.email_confirmed_at IS NULL
          AND u.email IS NOT NULL
          AND u.last_sign_in_at IS NULL
          AND u.created_at < now() - interval '2 days'
          AND u.created_at > now() - interval '7 days'
          AND NOT EXISTS (SELECT 1 FROM public.signup_reminders r WHERE r.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider <> 'email')
        ORDER BY u.created_at
        LIMIT greatest(p_limit, 0)
    ),
    claimed AS (
        INSERT INTO public.signup_reminders (user_id)
        SELECT id FROM due
        ON CONFLICT ON CONSTRAINT signup_reminders_pkey DO NOTHING
        RETURNING signup_reminders.user_id
    )
    SELECT d.id, d.email, d.created_at
    FROM due d
    JOIN claimed c ON c.user_id = d.id;
END;
$$;

COMMENT ON FUNCTION public.claim_signup_reminders(integer) IS
    'Segna e restituisce gli account da avvisare (registrati da 2-7 giorni, mai confermati). Solo la edge remind-unconfirmed-accounts.';

REVOKE ALL ON FUNCTION public.claim_signup_reminders(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_signup_reminders(integer) TO service_role;

-- 3. Job giornaliero ------------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'remind-unconfirmed-accounts') THEN
        PERFORM cron.unschedule('remind-unconfirmed-accounts');
    END IF;
END $$;

SELECT cron.schedule(
    'remind-unconfirmed-accounts',
    '0 8 * * *',
    $job$
    DO $$
    DECLARE
        v_base_url text := (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'edge_functions_base_url' LIMIT 1
        );
        v_secret text := (
            SELECT decrypted_secret FROM vault.decrypted_secrets
            WHERE name = 'internal_edge_secret' LIMIT 1
        );
    BEGIN
        IF v_base_url IS NULL OR v_secret IS NULL THEN
            RAISE NOTICE 'remind-unconfirmed-accounts: segreti del vault mancanti, salto';
            RETURN;
        END IF;

        PERFORM net.http_post(
            url     := v_base_url || '/functions/v1/remind-unconfirmed-accounts',
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'X-Internal-Secret', v_secret
            ),
            body    := '{}'::jsonb
        );
    END;
    $$;
    $job$
);

COMMIT;
