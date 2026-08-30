-- =============================================================================
-- ACL + trigger di public.reset_reservation_reminder_on_reschedule()
-- =============================================================================
--
-- File separato dalla CREATE FUNCTION (20260829120002): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- ── ACL ─────────────────────────────────────────────────────────────────────
-- La funzione e' SECURITY INVOKER, quindi non c'e' privilegio da abusare: il
-- REVOKE serve a igiene di catalogo, non a chiudere una falla. Resta comunque,
-- perche' Supabase pre-configura EXECUTE per `anon` e `authenticated` su ogni
-- nuova funzione, e una funzione trigger raggiungibile via
-- `POST /rest/v1/rpc/...` non ha ragione di comparire li' — plpgsql la
-- rifiuterebbe ("trigger functions can only be called as triggers"), ma
-- l'elenco delle RPC pubbliche deve contenere solo cio' che e' pubblico.
--
-- REVOKE FROM PUBLIC non basta: `anon` e `authenticated` vanno revocati
-- esplicitamente. Nessun GRANT di ritorno, il trigger non ne ha bisogno.
--
-- ACL attesa a fine migration: solo il proprietario (postgres).
-- =============================================================================

REVOKE ALL ON FUNCTION public.reset_reservation_reminder_on_reschedule() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_reservation_reminder_on_reschedule() FROM anon;
REVOKE ALL ON FUNCTION public.reset_reservation_reminder_on_reschedule() FROM authenticated;

-- ── Trigger ─────────────────────────────────────────────────────────────────
-- BEFORE UPDATE, FOR EACH ROW. BEFORE e non AFTER: le due colonne vanno
-- azzerate NELLA riga che si sta scrivendo, non con un secondo UPDATE dopo —
-- un AFTER dovrebbe rientrare sulla stessa tabella e riattiverebbe il trigger.
--
-- La clausola WHEN filtra a livello di motore: il corpo plpgsql non viene
-- nemmeno eseguito per gli UPDATE che non toccano data od ora, che sono la
-- stragrande maggioranza (cambi di stato da respond-reservation e
-- cancel-reservation-public passano di qui a ogni conferma e ogni disdetta).
-- Il controllo resta anche dentro la funzione: la WHEN e' un'ottimizzazione,
-- la correttezza non deve dipendere da lei.
DROP TRIGGER IF EXISTS reservations_reset_reminder_on_reschedule ON public.reservations;
CREATE TRIGGER reservations_reset_reminder_on_reschedule
    BEFORE UPDATE ON public.reservations
    FOR EACH ROW
    WHEN (
        OLD.reservation_date IS DISTINCT FROM NEW.reservation_date
        OR OLD.reservation_time IS DISTINCT FROM NEW.reservation_time
    )
    EXECUTE FUNCTION public.reset_reservation_reminder_on_reschedule();
