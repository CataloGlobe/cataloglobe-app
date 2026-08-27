-- =============================================================================
-- ACL di public.create_support_ticket(uuid, text, uuid, text)
-- =============================================================================
--
-- File separato dalla CREATE FUNCTION (20260827120000): `CREATE FUNCTION` +
-- `REVOKE`/`GRANT` nello stesso file fanno fallire `supabase db push` con
-- SQLSTATE 42601. Vedi docs/patterns/storage-sql.md.
--
-- A differenza delle funzioni trigger del dominio supporto (che restano al
-- solo proprietario), questa e' una RPC chiamata dal frontend: `authenticated`
-- DEVE avere EXECUTE.
--
-- Concederlo non allarga la superficie di attacco. La funzione e'
-- SECURITY INVOKER: gira con l'identita' e i privilegi del chiamante, quindi
-- non puo' fare nulla che il chiamante non possa gia' fare con due `.insert()`
-- diretti. L'unica cosa che aggiunge e' l'atomicita'. Un utente senza
-- `support.write` sul tenant riceve 42501 dalla policy, esattamente come sulla
-- INSERT diretta.
--
-- REVOKE espliciti:
--   PUBLIC        — il grant di default di Postgres su ogni nuova funzione
--   anon          — Supabase pre-concede a anon/authenticated/service_role;
--                   un utente non autenticato ha auth.uid() NULL, quindi
--                   fallirebbe comunque la WITH CHECK, ma la RPC non deve
--                   nemmeno essere raggiungibile da /rest/v1/rpc senza sessione
--   service_role  — nessun percorso server-side apre ticket per conto di un
--                   cliente. Se un giorno servisse (import, migrazione da un
--                   altro helpdesk) va concesso in modo esplicito e motivato,
--                   non ereditato da un default. Nota: service_role bypassa
--                   RLS, quindi con quel grant questa funzione diventerebbe
--                   un modo per creare ticket con un created_by arbitrario.
--
-- ACL attesa a fine migration:
--   postgres=X/postgres, authenticated=X/postgres
-- =============================================================================

REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_support_ticket(uuid, text, uuid, text) FROM service_role;

GRANT EXECUTE ON FUNCTION public.create_support_ticket(uuid, text, uuid, text) TO authenticated;
