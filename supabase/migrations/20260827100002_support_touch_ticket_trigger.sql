-- =============================================================================
-- ACL + trigger di public.support_touch_ticket_on_message()
-- =============================================================================
--
-- File separato dalla CREATE FUNCTION (20260827100001): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- ── ACL ─────────────────────────────────────────────────────────────────────
-- Una funzione trigger non viene mai invocata direttamente: la esegue il
-- motore per conto del proprietario della tabella, e il GRANT su di essa non
-- entra nel percorso di esecuzione del trigger. Il REVOKE serve comunque, ed
-- e' il punto: senza, `anon` e `authenticated` avrebbero EXECUTE (Supabase
-- pre-configura quei grant di default) su una funzione SECURITY DEFINER
-- chiamabile via `POST /rest/v1/rpc/...`. Non e' sfruttabile — plpgsql
-- rifiuta una funzione trigger invocata fuori da un trigger ("trigger
-- functions can only be called as triggers") — ma una funzione SECURITY
-- DEFINER esposta ad `anon` non deve esistere in catalogo per principio.
--
-- Nessun GRANT di ritorno: il trigger non ne ha bisogno.
-- REVOKE FROM PUBLIC non basta, `anon` va revocato esplicitamente.
--
-- ACL attesa a fine migration: solo il proprietario (postgres).
-- =============================================================================

REVOKE ALL ON FUNCTION public.support_touch_ticket_on_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_touch_ticket_on_message() FROM anon;
REVOKE ALL ON FUNCTION public.support_touch_ticket_on_message() FROM authenticated;

-- ── Trigger ─────────────────────────────────────────────────────────────────
-- AFTER INSERT, FOR EACH ROW. AFTER e non BEFORE: la riapertura deve avvenire
-- solo se il messaggio e' stato davvero scritto (INSERT policy superata).
DROP TRIGGER IF EXISTS support_messages_touch_ticket ON public.support_messages;
CREATE TRIGGER support_messages_touch_ticket
    AFTER INSERT ON public.support_messages
    FOR EACH ROW EXECUTE FUNCTION public.support_touch_ticket_on_message();
