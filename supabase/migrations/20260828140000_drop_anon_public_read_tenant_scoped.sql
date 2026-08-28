-- =============================================================================
-- Rimozione policy `anon SELECT USING (true)` su tabelle TENANT-SCOPED
--
-- ── PERCHE' ─────────────────────────────────────────────────────────────────
-- La migration 20260402120000_public_read_allergens_ingredients.sql (e le
-- migration sorelle del ciclo caratteristiche) hanno aperto in lettura anonima
-- quattro tabelle che portano `tenant_id`, con predicato `USING (true)`:
-- nessun filtro per tenant, nessun filtro per catalogo pubblicato. Chiunque
-- disponga della anon key — pubblica per definizione, e usata anche dal JWT
-- customer dell'epic ordinazioni, che ha claim `role: "anon"`
-- (supabase/functions/_shared/customerJwt.ts:81) — poteva leggere l'anagrafica
-- ingredienti e i legami prodotto↔ingrediente/allergene/caratteristica di
-- TUTTI i tenant della piattaforma.
--
-- Quelle policy erano un residuo dell'epoca in cui la pagina pubblica
-- risolveva il catalogo lato browser. Oggi non hanno piu' alcun consumatore:
--
--   * Letture pubbliche → Edge Function con SERVICE_ROLE_KEY, che bypassa RLS:
--       resolve-public-catalog/index.ts:292-294 (+ warm client :261-263)
--       resolve-public-story/index.ts:49-51
--     La pagina pubblica non tocca il DB per il catalogo: passa da
--     src/services/publicCatalog/fetchPublicCatalog.ts:277
--     (`supabase.functions.invoke("resolve-public-catalog")`).
--
--   * Flusso ordinazione customer → tutte le Edge Function della sessione
--     cliente usano SERVICE_ROLE_KEY (submit-order:467, cancel-order:271,
--     get-orders-for-session:294, resolve-table:465). Le letture dirette del
--     client customer (orders.ts, customerSessions.ts) toccano solo
--     orders / order_items / customer_sessions / order_groups, mai queste
--     quattro tabelle, nemmeno via embed PostgREST.
--
--   * Dashboard → ruolo `authenticated`, coperto dalle policy
--     `tenant_id IN (SELECT get_my_tenant_ids())` gia' presenti su tutte e
--     quattro le tabelle (SELECT/INSERT/UPDATE/DELETE).
--
-- ── COSA NON VIENE TOCCATO ──────────────────────────────────────────────────
-- Restano invariate le policy anon sulle lookup di PIATTAFORMA, che non hanno
-- `tenant_id` e il cui contenuto non e' dato di un cliente:
--
--   * `allergens`      → policy "Public can read v2_allergens" (anon +
--     authenticated). E' letta davvero da contesto anon:
--     src/pages/PublicCollectionPage/PublicCollectionPage.tsx:15,267 chiama
--     `listAllAllergens()` (src/services/supabase/allergens.ts:26-33) con la
--     anon key per popolare la sheet allergeni pubblica. Rimuoverla romperebbe
--     la pagina pubblica.
--   * `product_characteristics` → policy "Public can read
--     product_characteristics" (anon + authenticated), stessa natura.
--   * `supported_languages`, `status_checks`, `status_incidents`.
--
-- Nota: le tabelle qui sotto restano leggibili dalle Edge Function, che usano
-- `service_role` (BYPASSRLS). Nessun percorso applicativo viene interrotto.
-- =============================================================================

-- ingredients — anagrafica ingredienti del tenant
DROP POLICY IF EXISTS "Public can read ingredients"
    ON public.ingredients;

-- product_ingredients — join prodotto↔ingrediente
DROP POLICY IF EXISTS "Public can read product_ingredients"
    ON public.product_ingredients;

-- product_allergens — join prodotto↔allergene (la lookup `allergens` resta pubblica)
DROP POLICY IF EXISTS "Public can read product_allergens"
    ON public.product_allergens;

-- product_characteristic_assignments — join prodotto↔caratteristica
-- (la lookup `product_characteristics` resta pubblica)
DROP POLICY IF EXISTS "Public can read product_characteristic_assignments"
    ON public.product_characteristic_assignments;
