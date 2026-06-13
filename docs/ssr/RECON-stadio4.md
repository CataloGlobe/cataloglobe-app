# SSR Stadio 4 · FASE 1 — Recon infrastruttura build/deploy/routing

**Data**: 2026-06-12 · Read-only, nessuna modifica. Riferimenti verificati file:riga.

---

## 1. Build Vite

`vite.config.ts` (43 righe, unica config — nessuna variante per ambiente):
- **Plugin**: solo `@vitejs/plugin-react` (riga 7). Versione: Vite `^7` / plugin-react `^5.0.4` (package.json devDeps).
- **Alias** (righe 28-40): `@` → `./src` + 9 alias derivati (`@context`, `@components`, `@pages`, `@layouts`, `@services`, `@styles`, `@utils`, `@types`, `@assets`) — risoluzione `path.resolve` build-time, valgono per qualsiasi build (client e `--ssr`). ⚠️ `vitest.config.ts` ha SOLO `@` — i file toccati dall'SSR entry usano già solo `@/` o alias presenti.
- **`build`**: solo `rollupOptions.output.manualChunks` (righe 16-26: vendor-react/supabase/motion). **Niente `outDir` custom** (default `dist`), niente `base`, **nessuna config SSR esistente** (no `ssr.*`).
- **SCSS Modules**: zero config esplicita — convenzione `.module.scss` + `sass-embedded ^1.93.2`. Nessun `css.modules` override → hashing default, identico tra build client e SSR (stessa config/versione, validato dallo spike in dev).
- **`server.proxy`**: `/api` → `localhost:3001` (righe 8-14, solo dev).
- **`import.meta.env`**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ENV`, `VITE_USE_V*`, `VITE_PUBLIC_BOTTOM_BAR`, `VITE_REVALIDATE_SECRET`, `VITE_ADMIN_EMAIL` (da `.env.local`). Nel path pubblico: `publicAnalytics.ts:37` (SUPABASE_URL), `PublicCatalogReady.tsx` (SUPABASE_URL per reviewsProps), `CollectionView.tsx` (PUBLIC_BOTTOM_BAR), `client.ts` (URL+ANON_KEY via helper `getEnvValue` che fa fallback su `process.env` — righe 3-18, già Node-aware). In build `--ssr` Vite inlinea gli stessi valori.

## 2. Entry e bootstrap SPA

**`index.html`** (72 righe):
- Head statico: favicon/manifest/theme-color (5-10), `preconnect` a `%VITE_SUPABASE_URL%` (12 — placeholder env Vite in HTML, da replicare nella shell SSR), preconnect Google Fonts (13-14), **link blocking Inter+Sora** (15-18 — quello che il middleware de-blocca sul warm), title/description/OG/Twitter/canonical **statici di piattaforma** (22-39, marcati ⚠️ SYNC con `company.ts`), JSON-LD Organization (42-65).
- Body: `<div id="root"></div>` vuoto + `<script type="module" src="/src/main.tsx">` (68-69). Nessun altro script.

**`src/main.tsx`** (30 righe): `createRoot(#root).render(...)` con stack `StrictMode → ThemeProvider → TooltipProvider → BrowserRouter → AuthProvider → ToastProvider → NotificationsProvider → App` (13-28). Import side-effect: `@styles/global.scss` + `./i18n` (10-11).
⚠️ **Punto chiave per 4b/4c**: l'entry client SSR per `/:slug` dovrà `hydrateRoot` con un albero EQUIVALENTE a quello che `main.tsx` produce per quella route, oppure (più realistico) un entry client dedicato che monta solo lo stack pubblico — da decidere in design: la route `/:slug` oggi passa per App.tsx:286 (`PublicErrorBoundary → PublicCollectionPage`) e per i provider globali di main.tsx (Theme/Tooltip/Auth/Toast/Notifications). Quali di questi servono davvero alla pagina pubblica è la prima domanda del design 4b.

## 3. Script e dipendenze

`package.json`:
- `dev` = vite · `build` = **`tsc -b && vite build`** · `preview` = vite preview · `dev:api`/`dev:vercel` = `vercel dev --listen 3001` con source di `.env.local` · `dev:full` = concurrently vite+api.
- SSR-rilevanti già presenti: `react`/`react-dom` **19.2.6** (richiesto ^19.1.1 — `renderToPipeableStream` disponibile, validato spike), `@vercel/node ^5.8.2` (devDep, types per le function), `@vercel/functions ^3.7.0` (usato dal middleware per `waitUntil`), `@upstash/redis ^1.38.0`. Nessun `engines` in package.json; Node Vercel = **24.x** (`.vercel/project.json`).

## 4. Config Vercel

`vercel.json` (completo): **un solo rewrite catch-all `/(.*) → /index.html`** (fallback SPA, copre anche `/:slug` oggi) + blocco `headers` di security (nosniff, X-Frame DENY, referrer, permissions, HSTS, XSS) su `/(.*)`. **Niente** `functions`, `outputDirectory`, `cleanUrls`, `routes`, `crons` (i 3 cron in `api/cron/` sono evidentemente schedulati da dashboard).
- `.vercel/project.json`: framework **"vite"**, build/install/output command **null** → Vercel usa lo script `build` di package.json (`tsc -b && vite build`) e output `dist`.
- ⚠️ Ordine di matching Vercel: **filesystem (incluse `/api/*` functions) → middleware → rewrites**. Il rewrite catch-all NON cattura `/api/*`. Per l'SSR su `/:slug` servirà un rewrite più specifico PRIMA del catch-all (es. `/:slug([a-z0-9-]+)` → `/api/ssr-slug` o naming simile), con la stessa regex/deny-list del middleware (riga 85: matcher `"/:slug([a-z0-9-]+)"` + RESERVED_SEGMENTS 53-74).

## 5. Serverless function esistenti

**`api/public-catalog/index.ts`** (342 righe, **runtime Node** — `@vercel/node` types, riga 1; nessun `export const config` edge):
- GET `?slug&lang` → `callResolvePublicCatalog` (retry/timeout, `api/_lib/supabaseEdge.ts`) → su success: snapshot Upstash (`SNAPSHOT_TTL` 30g, key namespaced `cataloglobe:{VERCEL_ENV}:public-catalog:v1:{slug}:{lang}`) + **`Cache-Control: public, s-maxage=30, stale-while-revalidate=300`** (riga 241) + header `X-Cataloglobe-Source: live|stale`. Su network error → fallback snapshot Redis (s-maxage=10/swr=60). Errori normalizzati `{error:{code,messageKey,message?}}` (61-105). Branch `?warmup=1` keep-warm (133-175).
- Shape risposta = il payload `ResolvedPayloadShape` (ora tipizzato in `src/types/publicCatalog.ts`).
- **Env nelle function**: `process.env.*` diretto — `REDIS_KV_REST_API_URL/TOKEN` (redis.ts:27-28), `SUPABASE_URL ?? VITE_SUPABASE_URL` + `SUPABASE_ANON_KEY ?? VITE_SUPABASE_ANON_KEY ?? SERVICE_ROLE` (supabaseEdge.ts:50-54), `VERCEL_ENV` (redis.ts:39). → Il renderer SSR (function Node) legge env allo stesso modo; le VITE_* esistono già nell'env Vercel (le usa supabaseEdge come fallback).
- Altre: `api/public-catalog/revalidate.ts` (purge snapshot), `api/cron/*` (status, warmup), `api/admin/status-incidents.ts`, `api/_lib/*` (redis, retry, supabaseEdge, status*).

## 6. Middleware (cosa migra, cosa resta)

**`middleware.ts`** (330 righe, edge, auto-rilevato a root — nessuna entry vercel.json):
- Matcher `"/:slug([a-z0-9-]+)"` (83-86) + difesa: `SLUG_RE` (50), no `--`, `RESERVED_SEGMENTS` (53-74). Solo GET (176).
- Flusso: fetch parallelo di `/api/public-catalog?slug=` (cachata CDN) + shell `/index.html`, race a `META_WAIT_MS=900` (81); su timeout → fallback HTML originale + `waitUntil` per scaldare la cache (212-225). Inietta: title/description/og/twitter/canonical (260-270), **font dello stile attivo** via `buildSingleFamilyFontUrl` + marker `id="mw-font"` + de-block Inter/Sora shell (272-304), **og:image + preload cover** (305-310). Header `x-meta-injection: hit` + `Server-Timing` (322-323). Fallback duro: `return undefined` → statico invariato (326-329).
- **`src/utils/publicFontUrl.ts`** (48 righe): modulo **PURO** (vincolo documentato righe 12-13: no DOM/Node/process) — mappa token → URL Google Fonts CSS2. Consumers: middleware + `PublicCollectionPage` (font fallback cold, righe 456-482 pre-refactor). Direttamente riusabile dal renderer SSR (terzo consumer).
- **Migrazione**: sul path `/:slug` SSR-ato, TUTTO il lavoro del middleware viene assorbito dal renderer (head nativo: title/og/canonical/cover-preload/mw-font; in più contenuto reale). Il middleware deve **smettere di intercettare** le richieste servite dall'SSR (o essere rimosso del tutto se `/:slug` è la sua unica ragione — lo è: matcher only `/:slug`). Strategia rollout da decidere in design (es. middleware resta come fallback quando la function SSR fallisce → la function può rispondere 5xx e un fallback rewrite serve la SPA; oppure feature-flag per slug). Il marker `mw-font` è consumato da `PublicCollectionPage.tsx` (`document.getElementById("mw-font")`, riga ~310 post-refactor) — l'SSR dovrà emettere lo stesso marker (o uno equivalente) per disattivare il fallback font runtime.

## 7. Lo spike come base

`spike-ssr/` (untracked): 
- **Riusabile come base reale**: `entry-ready.tsx` (payload → `derivePageState` → `<MemoryRouter><PublicCatalogReady/></MemoryRouter>` + `renderToString`) è l'antenato diretto di `src/entry-server.tsx` — cambi necessari: `StaticRouter`, props reali (`orderingMaintenance` da query/state non esiste server-side → null ok, `activeTab` "menu", allergens server-side), `renderToPipeableStream`, shell HTML completa con inline `window.__PUBLIC_CATALOG__`.
- **Solo scaffold di test**: `run.mjs` (harness bare/shim con Proxy-logging), `server.mjs` (dev server hydration test), `entry-server.tsx`/`app.tsx` (mock CollectionView diretto, superato da entry-ready), `entry-client.tsx` (pattern `hydrateRoot` + `onRecoverableError` — il pattern si riusa, il file no), `api-stub.mjs`, `payload.json`, report/design/audit `.md`.

## 8. Vincoli e incognite per il build SSR

- **Albero pubblico SSR-safe verificato empiricamente**: probe `PublicCatalogReady` + provider su Node puro = zero errori/warning (passo 2, 38.293 byte). Framer Motion v12 confermato ok (nessun accesso browser render-time; feature-detection interna guardata). `react-dom/server` 19.2.6 disponibile.
- **SCSS/asset import lato server**: in build `--ssr` Vite gestisce nativamente `.module.scss` (estrae classi, non emette CSS dal bundle server) — nello spike via ssrLoadModule già funzionante. Gli asset (`@assets`) nel path pubblico: nessuno importato dall'albero `PublicCatalogReady` (probe pulito lo dimostra).
- **`supabase client` a module load**: `client.ts` **throwa** se mancano `VITE_SUPABASE_URL/ANON_KEY` (righe 46-49). In build SSR `import.meta.env` viene inlined da Vite (presenti a build-time su Vercel) → ok; il client è Node-aware (`isBrowserRuntime`, persistSession off).
- **Allergeni server-side**: `listAllAllergens()` (`allergens.ts:27-35`) = `supabase.from("allergens").select().order()` — tabella **cross-tenant senza RLS-gating utente** (eccezione documentata CLAUDE.md), query con anon key → **chiamabile così com'è dalla function Node** (il modulo importa solo il client singleton + un import innocuo di `revalidatePublicCatalog`). Alternativa senza bundlare il service: query diretta via helper `supabaseEdge`. Preferenza da decidere in 4d; nessun blocker.
- **`sessionId` (`crypto.randomUUID` render-time in `PublicCatalogReady`)**: noto, da rendere client-only (nota già nel codice).
- **Bottom bar flag**: `VITE_PUBLIC_BOTTOM_BAR=true` + mobile → structural mismatch chips/bottom-bar (`CollectionView.tsx:708`, scoperta stadio 2). **VA RISOLTO O FLAGGATO PRIMA dell'attivazione SSR su mobile** — è l'unico mismatch noto rimasto (stadio "2b" mai eseguito). In produzione il flag è — da verificare — attivo? `.env.local` sì; env Vercel da controllare in 4a.
- **tsc nel build**: `build` = `tsc -b && vite build` — l'entry SSR nuovo deve typecheckare nel project tsconfig (verificare include).
- **StrictMode/double-effects**: solo dev, non tocca SSR.

---

## Scoperte fuori scope

1. **Crons non in vercel.json** — gestiti da dashboard (3 file in `api/cron/`). Irrilevante per SSR, notato.
2. **`vitest.config.ts` alias parziale** (solo `@`): test futuri su moduli con alias `@components` ecc. fallirebbero il resolve. Oggi non morde.
3. Il **font fallback runtime** della pagina (`#mw-font` check) e il middleware condividono il contratto marker: qualsiasi rename va fatto in coppia.
