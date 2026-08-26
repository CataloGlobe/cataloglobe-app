-- =============================================================================
-- SUPPORTO — ACL delle funzioni trigger + CREATE TRIGGER
-- =============================================================================
--
-- File separato dalle CREATE FUNCTION (20260827100004): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- ── Perche' revocare su funzioni trigger ────────────────────────────────────
-- Una funzione trigger non viene mai invocata direttamente: il motore la
-- esegue per conto del proprietario della tabella, e il privilegio EXECUTE
-- NON entra nel percorso di esecuzione del trigger (viene verificato alla
-- CREATE TRIGGER, che qui gira come owner in migration). Revocare quindi non
-- puo' rompere il trigger.
--
-- Serve comunque: senza, `anon` e `authenticated` conservano l'EXECUTE di
-- default di Supabase su funzioni raggiungibili via `POST /rest/v1/rpc/...`.
-- Non e' sfruttabile — plpgsql rifiuta una funzione trigger chiamata fuori da
-- un trigger ("trigger functions can only be called as triggers") — ma la
-- superficie non deve esistere in catalogo. Stesso principio di
-- 20260429160000_revoke_public_from_trigger_functions.
--
-- REVOKE FROM PUBLIC non basta: Supabase pre-configura grant di default a
-- `anon, authenticated, service_role`, che vanno revocati per nome.
--
-- ACL attesa a fine migration per tutte e tre le funzioni: solo il
-- proprietario (postgres), nessuna entry per anon / authenticated /
-- service_role.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ACL delle due funzioni nuove (20260827100004)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.support_stamp_ticket_timestamps()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_stamp_ticket_timestamps()  FROM anon;
REVOKE ALL ON FUNCTION public.support_stamp_ticket_timestamps()  FROM authenticated;
REVOKE ALL ON FUNCTION public.support_stamp_ticket_timestamps()  FROM service_role;

REVOKE ALL ON FUNCTION public.support_stamp_message_timestamp()  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_stamp_message_timestamp()  FROM anon;
REVOKE ALL ON FUNCTION public.support_stamp_message_timestamp()  FROM authenticated;
REVOKE ALL ON FUNCTION public.support_stamp_message_timestamp()  FROM service_role;

-- -----------------------------------------------------------------------------
-- 2. Completa l'ACL di support_touch_ticket_on_message() (20260827100002)
-- -----------------------------------------------------------------------------
-- Quel file aveva revocato PUBLIC / anon / authenticated ma non service_role,
-- lasciando in piedi il grant di default. Verificato a valle dell'apply:
--   proacl = {postgres=X/postgres, service_role=X/postgres}
--
-- Impatto pratico nullo (service_role bypassa comunque RLS su tutto, e la
-- funzione resta non chiamabile fuori da un trigger), ma l'ACL dichiarata in
-- testa a quel file diceva "solo il proprietario". Allineamento, non fix.
--
-- Questa e' una REVOKE su un oggetto creato da una migration precedente, non
-- una modifica di quella migration: il file 20260827100002 resta intatto.
REVOKE ALL ON FUNCTION public.support_touch_ticket_on_message() FROM service_role;

-- -----------------------------------------------------------------------------
-- 3. Trigger BEFORE INSERT
-- -----------------------------------------------------------------------------
-- BEFORE e non AFTER: devono poter riscrivere NEW prima che la riga sia
-- materializzata. La WITH CHECK della policy INSERT viene valutata DOPO i
-- BEFORE ROW trigger, sulla riga finale — nessuna policy di 20260827100000
-- referenzia created_at / last_message_at, quindi la riscrittura non altera
-- l'esito del controllo di accesso.
DROP TRIGGER IF EXISTS support_tickets_stamp_timestamps ON public.support_tickets;
CREATE TRIGGER support_tickets_stamp_timestamps
    BEFORE INSERT ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.support_stamp_ticket_timestamps();

-- Unico BEFORE INSERT su questa tabella: nessuna dipendenza dall'ordine
-- alfabetico dei nomi trigger. L'AFTER INSERT support_messages_touch_ticket
-- (20260827100002) gira in una fase diversa e su una tabella diversa.
DROP TRIGGER IF EXISTS support_messages_stamp_created_at ON public.support_messages;
CREATE TRIGGER support_messages_stamp_created_at
    BEFORE INSERT ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.support_stamp_message_timestamp();
