# SSR Stadio 3 · FASE 1 — Audit decoupling fetch ↔ render in PublicCollectionPage

**Data**: 2026-06-12 · Read-only, nessuna modifica. Tutti i riferimenti verificati sui file reali.

File principale: `src/pages/PublicCollectionPage/PublicCollectionPage.tsx` (1004 righe). Route: `App.tsx:286` — `/:slug/:lang?` → `<PublicErrorBoundary><PublicCollectionPage/></PublicErrorBoundary>`.

---

## 1. Punto di acquisizione dati

Tutto orchestrato da **un singolo `useEffect`** nella pagina (righe **484–702**, deps `[slug, langFromUrl, simulateParam, navigate, retryToken]`), nessun React Query/SWR/store. Quattro sorgenti:

| # | Sorgente | Dove | Trigger |
|---|---|---|---|
| 1 | **Fetch principale** — `fetchPublicCatalog({slug, lang, simulate})` | chiamata a riga **652**; impl. `src/services/publicCatalog/fetchPublicCatalog.ts` | mount / cambio slug‑lang‑simulate / retry |
| 2 | **Fetch secondario** — `listAllAllergens()` (supabase client diretto, tabella cross-tenant `allergens`) | dentro `processPayload`, riga **574**; gated da `vertical_type` → `VERTICAL_CONFIG[..].productSections.allergens` (568-570) | dopo il payload, prima del set "ready" |
| 3 | **Fallback cache localStorage** — `getCached` riga **679** (su `network_error`), `setCached` riga **624** (write post-success live) | `src/services/publicCatalog/publicCatalogCache.ts` (key `cataloglobe:public-menu:v2:{slug}:{lang}`, TTL 7g, guard `isStorageAvailable` con probe) | solo error path / post-success |
| 4 | **`supabase.auth.getSession()`** riga **641** | solo se `?simulate=` presente (valida che l'utente sia autenticato) | param simulate |

`fetchPublicCatalog` ha **due path** (commento header righe 3-30): pubblico → `fetch("/api/public-catalog?slug&lang")` con retry 2×/timeout 3s (righe 161-228); simulate → `supabase.functions.invoke("resolve-public-catalog")` con retry 3×/6s (righe 259+). Risultato discriminato: `FetchSuccess | FetchDomainError | FetchNetworkError` (righe 43-63).

## 2. Forma del dato

- **Tipo del payload: opaco.** `PublicCatalogPayload = Record<string, unknown>` (`fetchPublicCatalog.ts:38`). La pagina lo casta a **`ResolvedPayloadShape`** (tipo **locale** alla pagina, righe **306-319**): `{ business: PublicBusiness, tenantLogoUrl, resolved: ResolvedCollections, subscription_inactive?, canonical_slug?, base_language_code?, effective_language?, available_languages?, lang_unsupported?, opening_hours?, upcoming_closures?, vertical_type? }`.
- `PublicBusiness`: tipo locale righe **221-273** (~30 campi: status, ordering_enabled, social, fees, hours_public…).
- `ResolvedCollections` (`src/types/resolvedCollections.ts:206`): `{ style?, featured?{before/after_catalog}, catalog? }` — già **risolto server-side** dalla Edge Function (scheduling/competizione regole): il client NON esegue il resolver.
- **Derivati client-side** (in render, puri): `parseTokens(resolved.style.config)` → `collectionStyle` (840-853), `mapCatalogToSectionGroups(resolved)` (179-215, chiamata a 855), `collectCatalogCharacteristics` (154-167, chiamata a 856), gating orari `hours_public` (596-598), `allFeaturedContents` (860-863).
- **Non nel payload**: `allergens` (fetch #2).

## 3. Catena di consumo

```
useEffect load() → fetchPublicCatalog → processPayload (512-627)
  → setState({status:"ready", business, resolved, tenantLogoUrl, openingHours,
              upcomingClosures, allergens, effectiveLanguage, baseLanguage,
              availableLanguages, isRefetching, isStale})        [riga 600-613]
        ↓ (render, ramo ready — righe 838-1001)
  derivazioni pure (tokens/sectionGroups/characteristics)
        ↓
  <CustomerSessionProvider activityId={business.id}>             [873]
    <LanguageProvider slug/currentLang/availableLanguages/baseLanguage>  [874-879]
      <PublicThemeScope style={resolved.style}>                  [880]
        <CollectionViewWithCustomerSession …~30 props />         [919-996]
          → <CollectionView {...props} orderingActive={ctx} />   [344-349]
```

Il dato **entra nell'albero `PublicCollectionView` esclusivamente via props** (incluse le 2 slot prop `featuredBefore/AfterCatalogSlot` con `<FeaturedBlock>` costruite dalla pagina, 924-937). I context trasportano solo: sessione customer (da `activityId`), lingua (da props già derivate), tema (CSS vars inline da `resolved.style`). Nessuno store globale.

## 4. Gestione stati

Union `PageState` (righe **275-304**), vive interamente nello `useState` della pagina (riga 398). Render per stato (792-836):

| Stato | Render |
|---|---|
| `loading` | `<AppLoader intent="public"/>` |
| `error` (network, no cache) | card errore + bottone retry (`retryToken++`, 422-425) |
| `domain_error` | `<NotFound variant="business"/>` |
| `inactive` | `<NotFound variant="business-inactive" inactiveReason/>` |
| `subscription_inactive` | `<NotFound variant="subscription-inactive"/>` |
| `empty` (no catalog né featured, 559-566) | `<NotFound variant="business-empty"/>` |
| `ready` (+flag `isRefetching`, `isStale`) | albero §3; `isStale` → `<StaleDataBanner onRetry/>` (882) |

## 5. Side-effect legati al timing del fetch

| Effetto | Dove | Trigger | Assume fetch client? |
|---|---|---|---|
| **Redirect** canonical_slug / lang_unsupported / lang==base → `navigate(replace)` | `processPayload` righe **531-543** | payload **fresco** (non da cache) | sì — girano dentro il flusso di fetch, non in un effect |
| `usePageHead` (title/meta/og/`<html lang>`) | pagina 438-443 + `src/hooks/usePageHead.ts` (tutto in `useEffect`, document API) | `state→ready` | effect-time, SSR-safe; in SSR diventa ridondante (head nativo) ma innocuo |
| **Font fallback** cold-hit (inject `<link id="public-font-fallback">`) | righe **456-482** | `activeFontToken` dal payload; skip se `#mw-font` presente | effect-time; SSR la renderà ridondante (assorbe il middleware) |
| **Preload cover** (`<link rel="preload">` in head) | righe **749-767** | `state→ready` + token `showCoverImage` | effect-time |
| **Analytics `page_view`** (`trackEvent` + `document.referrer`) | righe **769-779**, guard `pageViewTracked` ref una-tantum | `state→ready` | effect-time; il ref previene doppi invii nello stesso mount, **non** tra mount diversi |
| **Language toast** (translating→done) | righe **721-747** | transizioni `isRefetching` true→false dentro PageState | dipende dal *refetch* client (cambio lingua) |
| `i18n.changeLanguage` | `LanguageProvider.tsx:24-28` (effect) | `currentLang` prop | effect-time |
| Write cache `setCached` | riga **624** | post-success live (skip fromCache/simulate/stale) | sì, parte del flusso fetch |

## 6. Dipendenze runtime-only nel path fetch→primo-render

(Oltre a quanto già sistemato negli stadi 1-2.)

- **`crypto.randomUUID()`** in `useMemo` riga **718** (`sessionId` per reviewsProps) — **render-time**. Esiste in Node (non crasha) ma diverge server↔client; oggi è solo prop (non markup) → nessun mismatch. Da tenere d'occhio nel seam.
- `location.state` per maintenance (righe 367-380, `useMemo` render-time) — via React Router; con StaticRouter server-side è `null` → deterministico (`orderingMaintenanceFromState=null` su entrambi i lati al primo render).
- `import.meta.env.VITE_SUPABASE_URL` riga 719 — build-time, ok.
- localStorage: solo nel path cache (guarded, `publicCatalogCache.ts:28-38`) e mai in render.
- `supabase` client import — già Node-aware (stadio 0/spike).
- **Nessun nuovo accesso browser render-time trovato** nella catena pagina→CollectionView.
- Nota SSR: senza seam, il server renderizzerebbe **`AppLoader`** (stato iniziale `loading`) — è esattamente il motivo di questo stadio.

## 7. Punto di taglio proposto (seam)

**Confine: il ramo "ready".** Tre mosse architetturali (FASE 2):

1. **`derivePageState(payload, opts): { state: PageState } | { redirect: string }`** — estrarre da `processPayload` (512-627) una funzione **pura e sincrona**: i 3 redirect diventano **valori ritornati** (il chiamante naviga), il fetch allergeni **esce** dalla funzione (vedi sotto). Promuovere `ResolvedPayloadShape` + `PublicBusiness` a tipi condivisi (es. `src/types/publicCatalog.ts`), sostituendo il cast da `Record<string, unknown>`.
2. **`PublicCatalogReady`** — componente **prop-driven puro** che incapsula l'attuale ramo ready (derivazioni 840-863 + albero provider 873-1001). Props proposte:
   ```ts
   type PublicCatalogReadyProps = {
       slug: string;
       payload: ResolvedPayloadShape;      // dato server-resolved
       allergens: Allergen[] | null;        // iniettati (fetch fuori dal componente)
       isStale?: boolean;
       orderingMaintenance: {...} | null;   // resta derivato dalla page (location.state/URL/payload)
       onRetry?: () => void;                // per StaleDataBanner
   };
   ```
   Il toast lingua e `usePageHead` **restano nella page** (legati a refetch client e a stato page-level).
3. **Due chiamanti**:
   - **SPA** (`PublicCollectionPage`): identica a oggi — stato, fetch, retry, toast, head — ma il ramo ready renderizza `<PublicCatalogReady …/>`. Zero cambi di comportamento.
   - **SSR** (stadio 4): entry server fetcha payload (+ allergens) → renderizza direttamente `PublicCatalogReady` dentro lo stack provider; client hydrata leggendo `window.__PUBLIC_CATALOG__` e la page SPA parte con `useState(() => initialPayload ? derivePageState(...) : {status:"loading"})` saltando il primo fetch.

**Allergeni**: unico fetch client-side bloccante pre-ready. Opzioni per l'SSR (da decidere in FASE 2): (a) il server li fetcha e li inlinea accanto al payload (preferita — `PublicCatalogReady` resta puro); (b) render con `allergens=null` + fetch post-hydration (flicker nella sheet allergeni). In SPA resta com'è.

## 8. Rischi di regressione (e come verificarli in FASE 2)

| Rischio | Dettaglio | Verifica FASE 2 |
|---|---|---|
| **Redirect persi/duplicati** | i 3 `navigate(replace)` escono da `processPayload` → se il chiamante non li esegue (o li esegue 2×) si rompono alias slug e lang fallback | Playwright: slug alias → redirect canonical; `/:slug/IT` → lowercase; lang==base → strip |
| **Doppio fetch o fetch saltato** | con `initialPayload` (SSR) il primo fetch va saltato; in SPA non deve cambiare nulla | network tab/counter in dev: 1 sola GET `/api/public-catalog` in SPA; 0 in SSR-hydration |
| **`page_view` duplicato** | `pageViewTracked` è un ref della page: se il guard si sposta/monta due volte → doppio evento | spy su `trackEvent` in dev + log Edge |
| **Toast lingua rotto** | dipende dalle transizioni `isRefetching` nel PageState; spostarlo per errore nel Ready le perde | Playwright: cambio lingua → toast "translating→done" |
| **Allergeni mancanti** | sheet allergeni vuota se l'iniezione fallisce per vertical food | Playwright su tenant food: MoreSheet → lista allergeni presente |
| **Cache write semantics** | `setCached` solo su live non-simulate: il flusso va preservato nel nuovo chiamante | unit/manual: simulate e stale non scrivono cache |
| **Maintenance banner** | `orderingMaintenance` (state/URL/payload, 359-421) deve restare derivato page-level e fluire come prop | Playwright: `?maintenance=table_maintenance` → banner |
| **StaleDataBanner + retry** | `isStale`+`onRetry` attraversano il seam | manuale: kill API → cache fallback → banner + retry |
| **Preview Style Editor** | usa `CollectionView` direttamente (non la page) → fuori dal seam, ma regression check dovuto per la policy Playwright su `PublicCollectionView/` | smoke preview |

---

## Scoperte fuori scope

1. **`PublicCatalogPayload` non tipizzato** (`Record<string, unknown>`) con cast `as unknown as ResolvedPayloadShape` a riga 529 — il seam lo risolve di passaggio, segnalato perché è debito anche fuori dall'SSR.
2. **`isMobileViewport` matchMedia sync-init** (`CollectionView.tsx:708`) — structural mismatch chips/bottom-bar con `VITE_PUBLIC_BOTTOM_BAR=true` su mobile. Già emerso a fine Stadio 2 ("stadio 2b"), confermato fuori dal seam di questo stadio.
3. **`revalidatePublicCatalog.ts`** (120 righe, stesso folder del fetch) — non nel path della pagina pubblica; non analizzato oltre.
4. `EventsView`/`ReviewsView` ricevono fetch propri lazy post-interazione (non parte della catena catalogo) — irrilevanti per il seam, citati per completezza.
