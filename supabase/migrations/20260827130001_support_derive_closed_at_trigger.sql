-- =============================================================================
-- ACL di support_derive_closed_at() + CREATE TRIGGER
-- =============================================================================
--
-- File separato dalla CREATE FUNCTION (20260827130000): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- Nessun GRANT: e' una funzione trigger, non una RPC. L'EXECUTE non entra nel
-- percorso di esecuzione del trigger (Postgres lo verifica alla CREATE
-- TRIGGER, che qui gira come owner), quindi revocare non puo' romperla.
-- Serve comunque a togliere dal catalogo una funzione raggiungibile via
-- `POST /rest/v1/rpc/...` con i grant di default di Supabase — non
-- sfruttabile (plpgsql rifiuta le funzioni trigger chiamate fuori da un
-- trigger) ma inutile che esista.
--
-- Stesso trattamento di support_stamp_ticket_timestamps /
-- support_stamp_message_timestamp (20260827100005). ACL attesa: solo il
-- proprietario (postgres).
-- =============================================================================

REVOKE ALL ON FUNCTION public.support_derive_closed_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.support_derive_closed_at() FROM anon;
REVOKE ALL ON FUNCTION public.support_derive_closed_at() FROM authenticated;
REVOKE ALL ON FUNCTION public.support_derive_closed_at() FROM service_role;

-- BEFORE UPDATE: deve poter riscrivere NEW prima che la riga sia persistita.
-- FOR EACH ROW: la derivazione dipende da OLD.status della singola riga.
--
-- Scatta su OGNI UPDATE di support_tickets, incluse quelle fatte dal trigger
-- SECURITY DEFINER support_touch_ticket_on_message: verificato che i due
-- concordino su tutti i percorsi (vedi 20260827130000).
DROP TRIGGER IF EXISTS support_tickets_derive_closed_at ON public.support_tickets;
CREATE TRIGGER support_tickets_derive_closed_at
    BEFORE UPDATE ON public.support_tickets
    FOR EACH ROW EXECUTE FUNCTION public.support_derive_closed_at();
