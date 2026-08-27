-- =============================================================================
-- ACL di public.mark_support_ticket_read(uuid)
-- =============================================================================
--
-- File separato dalla CREATE FUNCTION (20260827140002): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- RPC chiamata dal frontend: `authenticated` DEVE avere EXECUTE.
--
-- ── Perche' qui il REVOKE conta piu' che altrove ────────────────────────────
-- A differenza di `create_support_ticket`, che e' SECURITY INVOKER e quindi
-- non puo' fare nulla che il chiamante non possa gia' fare, questa e'
-- SECURITY DEFINER: gira come owner e scavalca RLS. L'unica cosa che le
-- impedisce di scrivere su ticket altrui e' il doppio vincolo nel suo corpo
-- (appartenenza al tenant + support.read). Chi puo' chiamarla e' quindi parte
-- del perimetro di sicurezza, non un dettaglio di comodita'.
--
-- REVOKE espliciti:
--   PUBLIC        — grant di default di Postgres su ogni nuova funzione.
--   anon          — Supabase pre-concede a anon/authenticated/service_role.
--                   Senza sessione `auth.uid()` e' NULL, quindi
--                   `get_my_tenant_ids()` non ritorna nulla e la UPDATE
--                   toccherebbe zero righe: non sfruttabile. Ma una funzione
--                   SECURITY DEFINER non deve essere raggiungibile da
--                   /rest/v1/rpc senza autenticazione, punto.
--   service_role  — nessun percorso server-side marca letto un ticket per
--                   conto di un cliente: "letto" e' un fatto sull'utente, e
--                   un job che lo scrivesse spegnerebbe un pallino che
--                   nessuno ha guardato. Se un giorno servisse, va concesso
--                   in modo esplicito e motivato.
--
-- ACL attesa a fine migration:
--   postgres=X/postgres, authenticated=X/postgres
--
-- Verifica post-deploy (pattern di docs/patterns/storage-sql.md):
--   SELECT p.proname, p.prosecdef,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
--          has_function_privilege('service_role',  p.oid, 'EXECUTE') AS srv
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'mark_support_ticket_read';
--   -- atteso: prosecdef = true, anon = false, auth = true, srv = false
-- =============================================================================

REVOKE ALL ON FUNCTION public.mark_support_ticket_read(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_support_ticket_read(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.mark_support_ticket_read(uuid) FROM service_role;

GRANT EXECUTE ON FUNCTION public.mark_support_ticket_read(uuid) TO authenticated;
