# Spike di fattibilità SSR — pagina pubblica `/:slug`

**Data**: 2026-06-12 · **Esito prova**: render server reale riuscito + hydration verificata nel browser.
Scaffolding throwaway in `spike-ssr/` (untracked, non committare). Nessun file di produzione modificato.

---

## 1. Verdetto

**Accidentata-ma-percorribile, e meno accidentata del previsto.** Con **3 micro-fix** (simulati via transform Vite nello spike, senza toccare produzione) `CollectionView` con un payload reale di produzione (San Pietro, 8 sezioni, 21KB) renderizza su Node puro:

- `renderToString` → **34.7KB di HTML, zero errori, zero warning** (incluso nessun warning `useLayoutEffect`)
- output **deterministico** (2 run → HTML identico byte-per-byte)
- **hydration nel browser reale (Playwright) riuscita**: zero `onRecoverableError`, zero errori console su viewport desktop
- su viewport mobile (390px): hydration riuscita ma **1 mismatch di attributi** (non fatale, vedi §4)

Nessun blocker serio. Lo strato dati esiste già (middleware + `/api/public-catalog` + Redis). Il lavoro vero non è la SSR-safety dei componenti (piccola), è il refactor di `PublicCollectionPage` e l'infrastruttura build/function.

**Stima a spanne: 3–5 giorni** per arrivare a SSR in produzione sulla route `/:slug` (dettaglio §6).

---

## 2. Approccio SSR raccomandato (confermato via context7)

**Vite SSR build + Vercel Node Serverless Function con streaming.**

- **Build doppia** (pattern ufficiale Vite 7, docs v7.3.1):
  - `vite build --outDir dist/client` (client, con `--manifest` per gli asset)
  - `vite build --outDir dist/server --ssr src/entry-server.tsx` → modulo importabile direttamente dalla function, **niente `ssrLoadModule` in produzione** (quello è solo dev)
- **React 19**: `renderToPipeableStream` (docs react.dev) — streaming, `bootstrapScripts` per l'entry client, `onShellReady → pipe(response)`. Supporta `Suspense`/`React.lazy` (i sheet lazy della pagina). `renderToString` (usato nello spike per semplicità) resta il fallback non-streaming.
- **Runtime Vercel: Node, non Edge.** Motivi: `renderToPipeableStream` è l'API Node (Edge richiederebbe `renderToReadableStream` + bundle limits); supabase-js e l'albero dipendenze sono già Node-friendly; le Vercel Functions Node supportano streaming nativo (`supportsResponseStreaming`, docs Vercel). La function vive in `api/` come le esistenti.
- **Routing**: rewrite `/:slug` → function SSR in `vercel.json` (stessa regex/deny-list già usata dal middleware). L'attuale middleware edge di meta-injection viene **assorbito**: title/og/font injection diventano output nativo dell'HTML SSR. L'admin resta SPA statica (catch-all → index.html invariato).
- **Router**: in produzione usare `StaticRouter` (react-router v7) al posto del `MemoryRouter` dello spike.

### Flusso dati (mappato, non costruito)

1. Function SSR riceve `GET /:slug` → fetch **same-origin `/api/public-catalog?slug=`** (riusa CDN cache s-maxage=30 + retry + fallback Redis già esistenti — zero nuovo layer dati). In alternativa lettura Redis diretta, ma la fetch CDN-cachata è più semplice e già battle-tested.
2. Payload → stesse funzioni di mapping della pagina (`mapCatalogToSectionGroups` ecc.) → `renderToPipeableStream(<App payload={...}/>)`.
3. **Inline nell'HTML**: `<script>window.__PUBLIC_CATALOG__ = {payload}</script>` (escape `</script>`). L'entry client idrata leggendo quello → **React non ri-scarica il payload al mount**.
4. Errori/timeout della fetch → fallback: servire la SPA shell attuale (stesso invariante di safety del middleware di oggi).

---

## 3. La prova (il pezzo decisivo)

Harness: `spike-ssr/run.mjs` — Vite `createServer` middlewareMode + `ssrLoadModule` di `entry-server.tsx`, payload reale fetchato da `resolve-public-catalog` (salvato in `payload.json`). Due modalità:

- **bare**: Node puro senza global browser → mostra i crash reali uno alla volta
- **`--shim`**: `window`/`document`/`localStorage` come Proxy che loggano ogni accesso con stack → **mappa completa degli accessi in un run solo** (27 accessi distinti tracciati, vedi `result-shim.json`)

Crash reali incontrati in sequenza (bare), ciascuno poi "fixato" via transform plugin throwaway (`--no-portals`):

| # | Crash | Punto esatto | Categoria |
|---|---|---|---|
| 1 | `window is not defined` a **import time** | `src/services/analytics/publicAnalytics.ts:34-35` — `const DEVICE_TYPE = getDeviceType()` e `const SCREEN_WIDTH = window.innerWidth` a livello modulo | side effect top-level |
| 2 | `Target container is not a DOM element` → con nodeType corretto: **`Portals are not currently supported by the server renderer`** (errore React testuale) | `CollectionSectionNav.tsx:270` — `createPortal(..., document.body)` incondizionato nel render | portal render-time |
| 3 | `window is not defined` nel render | `CollectionView.tsx:735` — `useRef<HTMLElement \| Window>(window)` initializer | browser API in initializer |
| 4 | `document is not defined` | `CollectionSectionNav.tsx:306` — `document.body` come argomento del portal (valutato anche col portal stubbato) | idem #2, stesso fix |

Dopo questi 3 fix (il #4 è parte del #2): **render pulito**. Hydration test con server dev (`spike-ssr/server.mjs`) + `hydrateRoot` + Playwright: verde su desktop, 1 mismatch attributi su mobile (§4).

---

## 4. Mappa completa ostacoli SSR-safety

### BLOCKER render (fix necessari) — tutti facili/medi

| Ostacolo | File | Fix | Fixability |
|---|---|---|---|
| `DEVICE_TYPE`/`SCREEN_WIDTH` calcolati a module load | `publicAnalytics.ts:26-35` | lazy-init (computare al primo `trackEvent`) o guard `typeof window` | **facile** |
| `useRef(window)` initializer | `CollectionView.tsx:735` | `useRef<... \| null>(typeof window === "undefined" ? null : window)` — i consumer gestiscono già `container === window`, serve solo null-check | **facile** |
| Portal incondizionato (dropdown sezioni) | `CollectionSectionNav.tsx:270+306` | pattern `mounted` flag (`useEffect(() => setMounted(true))`) → portal solo client. È esattamente il fix che React suggerisce nell'errore | **facile/medio** |
| Portal in `LanguageSelector.tsx` (riga ~123) | idem | già condizionale all'apertura del dropdown, ma stesso pattern `mounted` per sicurezza | **facile** |

### WARNING / rischi hydration (non bloccano il render)

| Ostacolo | File | Dettaglio | Fixability |
|---|---|---|---|
| **Mismatch attributi header** (catturato empiricamente su mobile 390px) | `PublicCollectionHeader.tsx` (~94, ~125) | stili inline calcolati da viewport (`marginLeft 10 vs 16px`, `marginTop -120 vs -128px`, `isMobile` init `window.innerWidth < 768` con fallback `false`). React 19 idrata comunque ma **non patcha gli attributi** → header con metriche desktop sul primo paint mobile finché un re-render non corregge | **medio** — spostare le metriche viewport-dependent su CSS (`@media`/container query) o forzare re-render post-mount; serve cura per evitare flash di layout |
| `useLayoutEffect` in `PublicSheet.tsx:118-147` (body-lock iOS) | `PublicSheet.tsx` | **non si è manifestato** nello spike: i sheet sono chiusi al primo render (`AnimatePresence` non li monta). Nessun warning emesso. Da tenere d'occhio se mai si SSR-asse con sheet aperto | **n/a oggi** |
| `crypto.randomUUID()` per `sessionId` | `PublicCollectionPage.tsx` (useMemo) | diverso server/client ma è solo prop (non finisce nel markup) → nessun mismatch osservato | ok così |

### SAFE (verificati, nessuna azione)

- **Storage access negli initializer** (`CollectionView.tsx:857` sessionStorage, `ReviewsView.tsx:79` localStorage, `getAllergenPreferences`, `loadCustomerSession`): tutti dentro try/catch e/o guard `typeof window` → su Node il ReferenceError viene catturato → no crash. (Fragile-by-luck nei primi due: consiglio guard esplicita comunque.)
- **`src/services/supabase/client.ts`**: già Node-aware (`isBrowserRuntime`), supabase-js si inizializza pulito su Node. Richiede `VITE_SUPABASE_URL/ANON_KEY` nell'env della function (throw se mancanti).
- **`PublicThemeScope`**: puro inline style (`--pub-*` su un div) → SSR-safe nativamente, confermato nell'HTML generato.
- **i18n** (`src/i18n/index.ts`): init top-level con risorse bundled, no LanguageDetector, no browser API → safe. Per SSR multi-lingua servirà istanza per-request o `lng` settata prima del render (oggi hardcoded `it`).
- **framer-motion v12**: SSR-safe nel setup corrente (feature-detection interna guardata; `AnimatePresence` coi sheet chiusi non renderizza nulla). Zero errori/warning.
- **react-router v7, lucide, @tabler, culori**: nessun problema rilevato.
- **Componenti lazy** (`ItemDetail`, `SearchOverlay`, `OrderingSheet`, ...): non montati al primo render → non toccati dall'SSR. Con `renderToPipeableStream` + Suspense sarebbero comunque gestibili.

### Stili e hydration

- **SCSS Modules**: i class name hashati compaiono nell'HTML SSR e combaciano client-side (hydration verde lo dimostra — un mismatch di classi sarebbe esploso). In produzione le due build (client + SSR) generano gli stessi nomi (stesso algoritmo/config/versione Vite); da ri-verificare meccanicamente al primo build di produzione, ma è il pattern standard Vite SSR.
- HTML SSR contiene contenuto reale completo: sezioni, prodotti, prezzi, preload immagini, CSS vars del tema.

---

## 5. File dello spike

| File | Cosa |
|---|---|
| `spike-ssr/run.mjs` | harness render (bare/`--shim`/`--no-portals`) |
| `spike-ssr/app.tsx` | albero React replicato dal ramo "ready" della pagina (mapping copiato) |
| `spike-ssr/entry-server.tsx` / `entry-client.tsx` | render server / hydrateRoot |
| `spike-ssr/server.mjs` | mini server dev per il test hydration |
| `spike-ssr/payload.json` | payload reale `san-pietro-porta-venezia` |
| `spike-ssr/result-bare.json` / `result-shim.json` / `rendered-bare.html` | evidenze |

---

## 6. Stima sforzo per il piano SSR (a spanne, 3–5 giorni)

1. **Fix SSR-safety produzione** (≈0.5g): publicAnalytics lazy, `useRef(window)`, portal `mounted`-gate ×2, guard esplicite sugli storage initializer.
2. **Refactor `PublicCollectionPage`** (≈1g): estrarre il ramo "ready" in un componente prop-driven (`PublicCatalogReady`) che accetta il payload → usato sia dalla SPA (fetch client come oggi) sia dall'entry SSR. Mapping functions esportate o spostate in un modulo condiviso.
3. **Fix header viewport-dependent** (≈0.5–1g): metriche mobile/desktop via CSS invece di JS inline.
4. **Infra** (≈1–1.5g): `entry-server.tsx`/`entry-client.tsx` reali, doppia build in CI, function Node `api/ssr-slug` con `renderToPipeableStream` + inline payload + fallback SPA, rewrite vercel.json, assorbimento meta/font injection dal middleware.
5. **Hardening** (≈0.5–1g): i18n per-request, test hydration multi-viewport via Playwright, verifica class name parity sulle build di produzione, caching della response SSR (s-maxage come oggi).
