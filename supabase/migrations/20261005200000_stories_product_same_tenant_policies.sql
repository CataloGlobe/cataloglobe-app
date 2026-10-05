-- =============================================================================
-- Stories: il prodotto collegato a una storia appartiene alla stessa azienda.
-- =============================================================================
--
-- Problema: stories.product_id ha una FK semplice verso products(id) e le
-- policy di insert/update di stories guardano solo stories.tenant_id e la
-- sede. Chi scrive storie nella propria azienda può collegarne una al
-- prodotto di un'altra azienda (product_id è un uuid qualunque che esiste).
-- resolve-public-story legge con service_role e incorpora
-- product:product_id (id, name): il nome del prodotto altrui finisce nella
-- pagina pubblica della storia. stories era rimasta fuori da CG-01
-- (20260930150000).
--
-- Soluzione: la coppia di policy RESTRICTIVE di CG-01, "Parent same tenant
-- on insert/update". Vanno in AND con le PERMISSIVE esistenti, che restano
-- invariate. Forma "product_id IS NULL OR EXISTS (...)": la storia senza
-- prodotto passa. Il confronto esplicito dei tenant_id serve perché products
-- è leggibile oltre il tenant ("Public can read products", CG-08).
--
-- Perché non la FK composta (product_id, tenant_id) come per activity_id
-- (20260928120000): gli embed product:product_id (id, name) in
-- resolve-public-story e in src/services/supabase/stories.ts usano la
-- colonna come hint, che PostgREST risolve solo sulle FK a colonna singola.
-- Con la FK composta andrebbero riscritti edge e frontend, con un ordine di
-- rilascio in più. Qui niente cambia fuori dal database.
--
-- Copertura: solo PostgREST (authenticated). service_role bypassa RLS, ma
-- nessuna edge scrive product_id su stories (le edge leggono o cancellano).
-- Nessun ciclo 42P17: le policy di products non interrogano stories.
--
-- Dati: 0 storie con prodotto di un'altra azienda su staging (2026-10-05).
-- Le policy non toccano le righe esistenti; su produzione verificare comunque
-- con la query nella PR prima del push.
--
-- Idempotente: DROP POLICY IF EXISTS prima di ogni CREATE.
-- =============================================================================

DROP POLICY IF EXISTS "Parent same tenant on insert" ON public.stories;
CREATE POLICY "Parent same tenant on insert" ON public.stories
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    stories.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = stories.product_id AND p.tenant_id = stories.tenant_id)
  );

DROP POLICY IF EXISTS "Parent same tenant on update" ON public.stories;
CREATE POLICY "Parent same tenant on update" ON public.stories
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    stories.product_id IS NULL OR EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = stories.product_id AND p.tenant_id = stories.tenant_id)
  );
