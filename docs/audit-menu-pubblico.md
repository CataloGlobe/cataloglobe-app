# Audit menu pubblico CataloGlobe

## 1. Routing

**Route pubblica:** `src/App.tsx:239` → `/:slug/:lang?` `element={<PublicCollectionPage />`

- **Path:** `/:slug` (tenant/attività) + `/:slug/:lang` (lingua opzionale)
- **Componente:** `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` (eager import, riga 25)
- **NO auth guard:** nessuna ProtectedRoute wrapper; completamente accessibile a utenti anonimi
- **Storage:** slug e lingua via `useParams()`; lingua validata + normalizzata a lowercase
- **Redirect logica:**
  - Slug invalido (no slug param) → errore "invalid_link" (riga 256-259)
  - Lang format invalido → normalizza a lowercase (riga 265-270)
  - Lang base_language (non attivo su tenant) → redirect a `/:slug` canonico (riga 356-361)
  - Alias slug (trovato in activity_slug_aliases) → redirect canonico (riga 348-351)
  - Attività inattiva (status != "active") → NotFound variant="business-inactive" (riga 369-373)

## 2. Fetching dati

**Edge Function:** `supabase/functions/resolve-public-catalog/index.ts` → invocata via `supabase.functions.invoke("resolve-public-catalog")` da PublicCollectionPage riga 301

### Query sequence:
1. **Lookup attività (primaria):** `activities` table, `.select(ACTIVITY_SELECT).eq("slug", slug).maybeSingle()` (edge fn riga 284-288)
2. **Fallback alias:** se not found, query `activity_slug_aliases.select("activity_id").eq("slug", slug).maybeSingle()` (riga 297-301), poi fetch activities da ID (riga 306-310)
3. **Catalogs + tenantInfo (parallelo):** 
   - `resolveActivityCatalogs()` via shared helper (riga 396) → complex join su catalog, categories, products, variants, options, ingredients, allergens, characteristics
   - `supabase.rpc("get_tenant_public_info", {p_tenant_id: activity.tenant_id})` (riga 397)
4. **Hours + closures (parallelo, se `activity.hours_public`):**
   - `activity_hours.select(...).eq("activity_id", activity.id)` (riga 399-404)
   - `activity_closures.select(...).eq("activity_id", activity.id).or(...)` (riga 410-416, oggi + futuri)
5. **Base language:** `tenants.select("base_language_code").eq("id", activity.tenant_id).single()` (riga 421-425)
6. **Active languages (parallelo):** 
   - `tenant_languages.select(...).eq("tenant_id", ...).eq("is_active", true)` JOIN `supported_languages` (riga 442-446)
   - `supported_languages.select(...).eq("code", baseLanguage).single()` per base lang metadata (riga 449-453)
7. **Translations (se lang != base_language):** RPC `get_public_translations(p_tenant_id, p_lang, p_entities)` (riga 214) → traduce products, categories, ingredients, allergens, characteristics, featured, closures

### Client Supabase:
- **Edge Function usa:** `SUPABASE_SERVICE_ROLE_KEY` (riga 270) → accesso completo lato server
- **Frontend usa:** `VITE_SUPABASE_ANON_KEY` (src/services/supabase/client.ts:20) → accesso anonimo via RLS

### RPC chiamate (server-side nel frontend):
- `listAllAllergens()` (PublicCollectionPage riga 316) → fetch sistema allergens se vertical_type supporta allergens

### Caching:
- Header `Cache-Control: "public, max-age=0, s-maxage=30, stale-while-revalidate=300"` se no simulate (riga 266)
- Simulate requests → `no-store` (riga 265)

## 3. Modello dati

| Entità | Scopo | Dimensione stimata | Frequenza cambio | Stored in DB? |
|--------|-------|-------------------|------------------|---------------|
| `activities` | Ristoratore/attività (tenant owner) | < 1KB per row | Bassa (metadata) | Si |
| `activity_slug_aliases` | Alias slug per SEO/redirect | < 1KB per alias | Bassa | Si |
| `v2_catalogs` | Menu principal per attività | 1-10 KB | Media (aggiunte) | Si |
| `v2_catalog_categories` | Categorie menu (L1/L2/L3) | 1-5 KB | Media | Si |
| `v2_catalog_category_products` | Join category ↔ product | < 1 KB | Alta (visibilità) | Si |
| `v2_products` | Singoli prodotto (name, desc, price) | 2-10 KB | Media | Si |
| `v2_product_variants` | Varianti prodotto (size, portione) | 1-5 KB | Media | Si |
| `v2_product_option_groups` | Gruppi opzioni (es. "Condimenti") | 1-3 KB | Bassa | Si |
| `v2_product_option_values` | Singole opzioni (es. "Pepe extra") | 0.5-2 KB | Bassa | Si |
| `v2_ingredients` | Ingredienti catalogo (system lookup) | 0.5-1 KB | Bassa | Si |
| `v2_product_ingredients` | Join product ↔ ingredient | < 0.5 KB | Media | Si |
| `v2_allergens` | Sistema allergens (SMALLINT ID) | 0.5 KB | Bassa (system) | Si |
| `v2_product_allergens` | Join product ↔ allergen | < 0.5 KB | Media | Si |
| `v2_product_characteristics` | Caratteristiche prodotto (vegan, gluten-free) | 0.5-1 KB | Bassa | Si |
| `v2_product_characteristic_assignments` | Join product ↔ characteristic | < 0.5 KB | Media | Si |
| `v2_product_attributes` | Attributi customizzabili per vertical | 1-5 KB | Bassa | Si |
| `v2_product_attribute_values` | Valori attributi | 0.5-2 KB | Bassa | Si |
| `v2_featured_contents` | Contenuti evidenziati (hero, blok) | 5-20 KB | Media (edit) | Si |
| `v2_schedule_featured_contents` | Join schedule ↔ featured | < 0.5 KB | Media | Si |
| `v2_styles` | Tema/branding (colori, fonts) | 5-15 KB | Bassa (design) | Si |
| `v2_style_versions` | Snapshot style per versionamento | 5-15 KB | Bassa | Si |
| `activity_hours` | Orari apertura per day/slot | 0.5 KB per slot | Bassa | Si |
| `activity_closures` | Chiusure temporanee/festivi | 1-2 KB | Media (temporale) | Si |
| `tenant_languages` | Lingue attive per tenant | 0.1 KB per lingua | Bassa | Si |
| `supported_languages` | Sistema lingue (lookup) | 0.1 KB | Bassa (system) | Si |
| `public_translations` | Traduzioni per field entity | 0.5-2 KB per entity | Alta (traduzioni) | Si |

**Storage immagini:** 
- `activities.cover_image` → URL esterno (Supabase Storage o CDN)
- `v2_products.image_url` → URL esterno (riga PublicCollectionPage mapProductToItem)
- `v2_featured_contents.image` → URL esterno
- `v2_tenants.logo_url` (via RPC get_tenant_public_info) → URL esterno

## 4. RLS

**Policie pubbliche visibili:**
- `supabase/migrations/20260227203000_v2_rls_tighten_public_reads.sql` **DROPS** tutte le `"Public can read v2_*"` policies su tabelle tenant-owned (catalogs, products, categories, styles, schedules, featured_contents, allergens) riga 14-38
- **Rimane:** `"Public can read v2_allergens"` (system table, riga 12)
- **Rimane:** `"Public can read v2_activity_groups"` e `"Public can read v2_activity_group_members"` (riga 19-20 della migration 20260309100000)

**Accesso pubblico al catalogo:** via RPC `get_public_translations()` e `get_tenant_public_info()` → SECURITY DEFINER (server-side trusted) che bypassa RLS ed espone dati pubblici filtrati

**Distinzione dato pubblico vs interno:**
- `activities.hours_public`, `activities.hours_public`, `.payment_methods_public`, `.services_public`, `.fees_public` (riga edge fn 352-357) → flag boolean per visibilità
- Prodotti/categorie: nessun flag `published` esplicito nel codice letto; **presunto:** `is_visible` field su catalog_category_products o prodotti stessi (da verificare schema)
- **Assunzione:** edge function `resolveActivityCatalogs()` filtra solo prodotti `is_visible = true`

**Multi-tenant RLS:** 
- `v2_tenants.owner_user_id = auth.uid()` per utenti autenticati (riga migration 95)
- Funzione helper `get_my_tenant_ids()` (migration riga 53-63) → cached STABLE, SECURITY INVOKER
- Catalogs/products/schedules legati a `tenant_id` via RLS policies "Tenant * own rows" (migration riga 12-13 dynamic block pattern)

## 5. Pubblicazione

**Flag di pubblicazione:** 
- `activities.status` = "active" | "inactive" (edge fn riga 274, PublicCollectionPage riga 369)
- `activities.inactive_reason` = "maintenance" | "closed" | "unavailable" | null
- Nessun flag `published` su catalogs/products nel codice letto

**Modifica e live:**
- **Modifica = immediatamente live:** nessun step "pubblica" intermedio visibile; cache buster via `s-maxage=30` → max 30s prima che Vercel CDN riconsulti edge function

**Versionamento style:**
- `v2_style_versions` table esiste (migration 20260224152000); schema non letto completamente
- Snapshot model presunto: salva versioni JSON style config, edge fn carica `resolved.style.config` per rendering frontend

## 6. Vercel / hosting

**vercel.json** (riga presente):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ],
  "headers": [...]
}
```
- SPA pura: tutti gli URL non-file rewritano su `/index.html` → React Router gestisce routing client-side
- Headers di sicurezza: X-Content-Type-Options, X-Frame-Options (DENY), Permissions-Policy (camera/microphone/geolocation disabilitate), HSTS preload

**Build:** `package.json` riga 4: `"build": "tsc -b && vite build"`
- TypeScript compilation seguito da Vite production build
- Vite SPA (no SSR); output a `/dist/`

**Env vars Supabase (nomi solamente):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- Edge function: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (server-side secret)

**API/Edge:** 
- Supabase Edge Functions (Deno runtime) → `supabase/functions/resolve-public-catalog/`
- RPC Postgres → `get_public_translations()`, `get_tenant_public_info()`, `get_my_tenant_ids()`

## 7. Service Worker

**Service Worker:** NON trovato (cerca in public/ → empty)
**Manifest PWA:** NON trovato
**Workbox:** NON trovato in dependencies
**index.html:** caricamento standard (nessun manuale service worker registration visibile)

**Implicazione:** APP **non è PWA** (no offline support, no caching strategy custom). Browser nativo + Vercel CDN handling per cache.

## 8. Gestione errori

**Page loading state machine** (PublicCollectionPage riga 137-163):
```
loading → error → inactive → subscription_inactive → empty → ready
```

**Cosa succede su Supabase fail:**
- **Edge function error** (riga 295-323 edge fn): `catch (err) → throw error` bubbles a frontend
- **Frontend catch** (PublicCollectionPage riga 362-367): `setState({status: "error", messageKey: "page.loading_error"})`
- **Render:** `<NotFound variant="business" />` con messaggio i18n

**Spinner:** `<AppLoader intent="public" />` (riga 30-32 PublicCollectionPage loading state)
- Message: "Caricamento del menu…" (AppLoader.tsx:11)
- Framer Motion fade-in + scale animation (AppLoader.tsx riga 33-51)

**Retry:** NO explicit retry button/mechanism visibile. Se error → stuck. User must reload page.

**Allergens fallback** (riga 316-322): try/catch non-blocking → allergens = null se fallisce; panel non render (graceful)

**Network error:** RPC `get_public_translations()` fail (edge fn riga 220-223) → console.error, return void, render in source language (fallback graceful)

**No Error Boundary component:** wrapping a ErrorBoundary per il subtree pubblico non visibile. React Suspense boundary esiste ma solo fallback AppLoader generico (App.tsx:85).

---

## Sintesi rischi

- **Nessun retry:** fallimento Supabase → pagina bloccata su loader spinner infinito
- **RLS tightened ma RPC critical:** accesso pubblico dipende da `get_tenant_public_info()` + `get_public_translations()` RPC corrette; se RPC buggy → leak dati privati
- **Service role key in Edge Function:** standard secure (server-side secret), ma se leaked → accesso completo DB
- **PWA assente:** nessuna resilienza offline; anche connessione lenta = UX pessima
- **Cache buster corto (30s):** live updates veloci ma CDN overhead maggiore
- **Lang unsupported redirect:** UX OK (fallback a base), ma no i18n fallback chain visibile nel resolver
- **Alias slug extra query:** lookup 2-hit (direct + alias) su ogni richiesta; index su activity_slug_aliases.slug presumibile ma non verificato

## Domande aperte

- **is_visible / published flag:** quale field governa visibilità prodotto/catalogo nel resolver? (assunto `is_visible` on catalog_category_products ma schema product non letto)
- **Caratteristiche null handling:** se product.characteristics è null, cosa passa al frontend? (codice defensivo `.filter(p => p.is_visible)` present, ma null check?)
- **Translation RPC performance:** con molti prodotti (500+), batch RPC size? Risk di timeout?
- **Cache invalidation:** ~~come viene invalidato cache Vercel quando ristoratore modifica catalogo? Webhook → purge, oppure TTL attendere?~~ → **Risolto in Tappa 2.3.** Endpoint `POST /api/public-catalog/revalidate` autenticato via header `Authorization: Bearer <REVALIDATE_SECRET>`. Cancella tutte le chiavi Redis matching pattern `cataloglobe:{env}:public-catalog:v1:<slug>:*` (tutte le lingue) e ripopola lo snapshot base. Service layer chiama `revalidatePublicCatalogForTenant(tenantId)` (fire-and-forget) dopo ogni write rilevante. Token client esposto via `VITE_REVALIDATE_SECRET` (trade-off documentato in `src/services/publicCatalog/revalidatePublicCatalog.ts`: il danno massimo di abuso è "carico extra", non leak dati).
- **Activity cover_image external URL:** dove hosted? Supabase Storage bucket o AWS S3? No read policy check nel codice.
- **Vertical type fallback:** `vertical_type ?? null` (riga 433 edge fn) — cosa succede se undefined? VERTICAL_CONFIG lookup fail?
- **Alias slug cost:** redirect sul canonico è client-side (navigate()) o server-side? Impact su UX/crawlability?

