-- =============================================================================
-- Lettura di tenants e activities per gli admin di PIATTAFORMA
-- =============================================================================
--
-- Due policy SELECT nuove, una per tabella, entrambe `USING
-- (public.is_platform_admin())`. AGGIUNTA PURA: nessuna policy esistente viene
-- droppata, riscritta o toccata. Le policy PERMISSIVE si compongono in OR,
-- quindi il comportamento per chiunque non sia platform admin resta
-- bit-per-bit quello di prima.
--
-- ── Perche' serve ───────────────────────────────────────────────────────────
-- La coda di supporto in /admin/supporto mostra i ticket di TUTTI i tenant: la
-- policy SELECT di `support_tickets` (20260827100000) ha gia' un ramo
-- `OR is_platform_admin()`. Chi risponde vede quindi oggetto, messaggi e stato
-- di qualunque azienda — ma NON il nome dell'azienda, perche' quello vive su
-- `public.tenants`, la cui unica policy SELECT e'
--
--     (owner_user_id = auth.uid() AND deleted_at IS NULL)
--     OR id IN (SELECT get_my_tenant_ids())
--
-- e un platform admin non e' ne' owner ne' membro. Stessa situazione su
-- `public.activities` per il nome della sede: tre policy SELECT permissive
-- (get_public_tenant_ids, get_my_activity_ids, is_tenant_owner_or_admin),
-- nessuna che contempli la piattaforma.
--
-- Senza il nome dell'azienda la coda e' una lista di oggetti senza mittente:
-- illeggibile per il lavoro che deve servire.
--
-- ── Perche' non ci si accontenta di degradare ───────────────────────────────
-- Un embed PostgREST (`support_tickets?select=*,tenants(name)`) su una risorsa
-- che RLS non concede NON produce un errore: restituisce `null`. La coda
-- mostrerebbe righe senza nome, in silenzio, e il difetto si scoprirebbe solo
-- guardando lo schermo — mai da un log, mai da un test che non asserisca sul
-- valore. Una modalita' di fallimento muta e' peggiore di una rumorosa: la
-- si chiude alla radice.
--
-- ── Perche' e' un allargamento coerente e non arbitrario ────────────────────
-- Il confine e' gia' stato posto altrove: al platform admin sono gia' visibili
-- TUTTI i `support_tickets` e TUTTI i `support_messages` di ogni tenant
-- (20260827100000), cioe' il contenuto delle conversazioni. Fermare
-- l'autorizzazione un passo prima del NOME dell'azienda non protegge alcun
-- dato: rende solo il lavoro impossibile da fare. Il nome del tenant e' fra
-- l'altro gia' leggibile da chiunque, anche non autenticato, via
-- `get_tenant_public_info(uuid)` (20260324120000, GRANT ad anon), che la pagina
-- pubblica usa per intestare il catalogo.
--
-- ── SELECT soltanto ─────────────────────────────────────────────────────────
-- Nessuna INSERT / UPDATE / DELETE per il platform admin su queste due
-- tabelle. Legge, non tocca: le mutazioni su tenants e activities restano
-- dell'owner e dei ruoli tenant-wide, esattamente come prima. Se un giorno
-- servisse (una futura /admin/tenant), va concesso in modo esplicito e
-- motivato, non ereditato da qui.
--
-- ── Precedente in casa ──────────────────────────────────────────────────────
-- 20260611090000 ha risolto un caso analogo su `activities` aggiungendo una
-- SECONDA policy SELECT permissiva invece di riscrivere la prima, proprio per
-- non rimettere in discussione un'espressione gia' collaudata. Stessa forma
-- qui.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- tenants — SELECT per platform admin
-- -----------------------------------------------------------------------------
-- `DROP POLICY IF EXISTS` sul SOLO nome nuovo (idempotenza cross-ambiente, come
-- da regola di progetto): non tocca "Users can read their tenants", che resta
-- dov'e'.
DROP POLICY IF EXISTS "Platform admins can read tenants" ON public.tenants;
CREATE POLICY "Platform admins can read tenants"
  ON public.tenants
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- -----------------------------------------------------------------------------
-- activities — SELECT per platform admin
-- -----------------------------------------------------------------------------
-- Serve al nome della sede sui ticket che ne indicano una (`activity_id` non
-- nullo). Quarta policy SELECT permissiva della tabella: si somma alle tre
-- esistenti senza interferirvi.
DROP POLICY IF EXISTS "Platform admins can read activities" ON public.activities;
CREATE POLICY "Platform admins can read activities"
  ON public.activities
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

COMMIT;
