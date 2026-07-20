# AUDIT FASE 1 (read-only) — Resilienza render pubblico con Supabase down

**Data**: 2026-07-18 · **Scope**: solo diagnosi, nessuna modifica. Fix → FASE 2.

**Domanda centrale**: se Supabase smette di rispondere per 20 min, il cliente che scansiona il QR vede il menù (stale) o una pagina rotta?

---

## Risposta secca

**Dipende dallo stato dello snapshot Redis per quello slug:**

- **Menù già renderizzato/pubblicato negli ultimi 30 giorni → il cliente VEDE il menù (stale).** L'SSR serve lo snapshot Redis Upstash. `source="stale"`, HTML completo con dati inline. ✅
- **Menù mai messo in cache (slug mai visitato + mai pubblicato-con-revalidate) OPPURE Redis anch'esso down → il cliente vede PAGINA DI ERRORE.** SSR ritorna shell SPA vuoto → il client ri-fetcha → fallisce → error card `page.loading_error`. ❌

**Punto chiave**: Redis Upstash è un servizio **separato** da Supabase. "Supabase down" ≠ "Redis down". Finché Redis + lambda Vercel sono up, i menù attivi restano serviti stale fino a 30 giorni. La resilienza esiste ed è reale — ma copre solo gli slug già scaldati.

---

## Diagramma flusso reale

```
Cliente → GET /:slug
   │
   ▼
vercel.json rewrite  /:slug([a-z0-9...])  →  /api/ssr-render?slug=:slug
   │                                          (regex, vercel.json:8-12)
   ▼
api/ssr-render/index.ts  handler (lambda Node, region pin Vercel)
   │
   ├─ fetchPayload(slug, lang)                     [index.ts:149-206]
   │     │
   │     ├─ callResolvePublicCatalog()  ──HTTP POST──►  Supabase Edge Fn
   │     │   (api/_lib/supabaseEdge.ts:91)             resolve-public-catalog
   │     │   retry: 3 tentativi × 6s timeout,          (10+ query DB sincrone,
   │     │   backoff 0/1/3s + jitter                    nessuna cache interna)
   │     │   [api/_lib/retry.ts:3-6]                     │
   │     │                                               ▼
   │     │                                          PostgreSQL (RLS)
   │     │
   │     ├─ SUCCESS + healthy → write snapshot Redis (best-effort, ex=30gg)
   │     │                       return {source:"live"}         [index.ts:156-178]
   │     │
   │     ├─ domain_error (404 slug) → return error domain_404   [index.ts:181-182]
   │     │
   │     └─ network_error (Supabase down/timeout):
   │            └─ getRedis().get(snapshotKey)                  [index.ts:185-205]
   │                 ├─ snapshot valido → return {source:"stale"}   ✅ MENÙ
   │                 └─ niente snapshot → return error network_no_snapshot ❌
   │
   ├─ error network_no_snapshot → serveSpaFallback(200, reason)  [index.ts:260-265]
   │     └─ dist/index.html (shell SPA vuoto, no payload inline)
   │           └─ client boota → fetchPublicCatalog → RI-fallisce → error card
   │
   └─ payload OK → renderPublic() SSR → HTML streaming 3 parti   [index.ts:301-302]
         beforeApp (head+#root) · markup React · afterApp
         window.__PUBLIC_CATALOG__ = {payload, allergens}  inline  [publicShell.ts:66-73]
         Cache-Control:
            live  → public, s-maxage=30, stale-while-revalidate=300
            stale → public, s-maxage=10, stale-while-revalidate=60
```

---

## Risposte puntuali

### 1. Catena render end-to-end
`/:slug` → rewrite Vercel → lambda `api/ssr-render` → HTTP POST all'edge fn `resolve-public-catalog` → PostgreSQL. HTML full con dati inline, streaming. `api/public-catalog` **NON è dead**: endpoint dati separato usato dal client (language switch, retry) — stesso pattern retry+Redis, caller diverso. `ssr-render` NON passa da `api/public-catalog` (chiama l'edge direttamente).

### 2. Il render legge Supabase live a ogni richiesta?
**Sì**, live via `fetch()` nativo (non SDK) all'edge fn, ad ogni request. Con davanti: CDN Vercel (s-maxage 30s) + snapshot Redis (fallback). Cache in-memory module-level solo per bundle/template/manifest (non per i dati).

### 3. Layer di cache tra render e Supabase
- **Redis Upstash read-through-ish** (`api/_lib/redis.ts`): TTL **30 giorni**, key `cataloglobe:{env}:public-catalog:v1:{slug}:{lang|base}`. Scrittura best-effort su ogni render live healthy. Su cache-miss + Supabase down → errore.
- **CDN Vercel su HTML**: sì, header lambda-level `s-maxage=30, swr=300` (live) / `s-maxage=10, swr=60` (stale). `vercel.json` NON setta Cache-Control sul route (solo header security). Finestra CDN sottile (~30s+5min).
- **ISR-like**: no ISR Vercel vero. C'è `api/public-catalog/revalidate.ts` = purge Redis manuale + ripopolo.

### 4. Comportamento su errore/timeout Supabase — CRUX
`fetchPayload` [`api/ssr-render/index.ts:149-206`]:
- `network_error` dopo 3×6s → legge snapshot Redis → se presente serve **stale** (menù ok), se assente → `error: "network_no_snapshot"`.
- Handler [`:260-265`]: qualsiasi error ≠ `domain_404` → `serveSpaFallback(200, reason)` → `dist/index.html` shell vuoto (no 5xx, ma **no dati**).
- `serveSpaFallback` [`:130-139`]: `Cache-Control no-store`, header `X-Cataloglobe-Ssr: fallback:<reason>`. Se manca pure `dist/index.html` → 503 testo.
- Outer `try/catch` [`:258` + `catch`]: eccezione render → log `ssr_render_error` → `serveSpaFallback(200,"render_error")`.

**Non propaga mai 5xx HTML rotto**. Ma lo shell SPA vuoto durante outage = errore lato client (il client ri-fetcha e fallisce).

### 5. Service worker
**NON esiste.** Nessuna registrazione in `index.html`, nessun `vite-plugin-pwa`/workbox, nessun `sw.js`. `site.webmanifest` presente ma senza SW → non funzionale offline. Conseguenza: **cliente NUOVO durante outage non ha alcun fallback offline**; e nemmeno il repeat-visitor guadagna resilienza extra oltre CDN+Redis. Copertura del caso QR affidata interamente a Redis+lambda.

### 6. Invalidazione su pubblicazione
**Esiste.** Fire-and-forget `revalidatePublicCatalogForTenant(tenantId)` dopo create/update/delete di prodotti e cataloghi (`src/services/supabase/products.ts:411,533,658`; `catalogs.ts:66,84,96`) → POST `/api/public-catalog/revalidate` (Bearer `REVALIDATE_SECRET`) → cancella `...:{slug}:*` (tutte le lingue) + ripopola snapshot base. Se il revalidate fallisce → lo snapshot vecchio resta fino a TTL. ⚠️ Il secret è `VITE_*` → esposto nel bundle browser (trade-off documentato nel codice).

---

## Inventario layer di resilienza

| Layer | Stato | Copertura outage |
|---|---|---|
| Retry edge (3×6s + backoff) | ✅ | assorbe blip brevi, non outage 20min |
| CDN Vercel s-maxage/SWR | ✅ ma sottile (30s+5min / 10s+1min) | copre solo i primi minuti per slug caldo |
| **Snapshot Redis Upstash (30gg)** | ✅ **layer principale** | serve stale per slug scaldati, indipendente da Supabase |
| Revalidate su publish | ✅ | scalda base-lang alla pubblicazione |
| SPA fallback no-5xx | ✅ (no pagina rotta hard) | ma shell vuoto → error client se no snapshot |
| Service worker / offline | ❌ assente | zero |
| Timeout su chiamate Redis | ❌ assente | Redis degradato può stallare la request |

---

## Gap list (ordinata per impatto sul caso "cliente al tavolo durante outage DB")

1. **Slug freddo = pagina rotta durante outage.** Menù mai renderizzato+cachato negli ultimi 30gg (ristorante nuovo, slug appena creato, o snapshot scaduto per inattività) → `network_no_snapshot` → error card. Nessun pre-warming garantito degli slug attivi. **Impatto alto** per aperture/QR nuovi.
2. **Cambio lingua durante outage rompe anche col base servito.** Snapshot non-base-lang cachato solo se qualcuno ha già visitato quella lingua. Il client, al language switch, ri-fetcha (`PublicCollectionPage:238-247`) → fallisce → unmount SSR → error (`:363-389`). Il cliente straniero vede errore anche se il menù base era visibile. **Impatto medio-alto**.
3. **Redis è single point of failure del fallback, senza timeout.** Se Upstash è down o lento, il fallback salta (down) o stalla la request (nessun timeout sui `getRedis().get/set` — noto). Con Redis down + Supabase down → tutto rotto. **Impatto medio** (Redis raramente down insieme, ma il no-timeout è latente).
4. **Nessun service worker.** Zero fallback offline/edge per il cliente. In un outage combinato (o rete sala flaky) non c'è ultima linea di difesa lato device. Un SW che cachi l'ultimo menù HTML/JSON coprirebbe il repeat-visitor e il vero offline. **Impatto medio** (mitigato da Redis per il caso DB-only).
5. **Finestra CDN sottile.** `s-maxage=30` (10 su stale) → la CDN scarica sul lambda quasi subito; la resilienza dipende quasi solo da Redis, non dalla CDN. Aumentare s-maxage/SWR darebbe un cuscinetto CDN più ampio prima di toccare Redis. **Impatto basso-medio**.
6. **Snapshot solo se `isHealthyPayload`.** Cataloghi vuoti / subscription lapsed (200 con catalogo vuoto) potrebbero non essere cachati → nessuno stale servibile per quei casi. **Impatto basso**.
7. **Revalidate best-effort + secret nel bundle.** Se il POST revalidate fallisce silenziosamente, si serve stale post-publish fino a TTL (no alerting osservato). Secret esposto lato client. **Impatto basso** (resilienza), ma nota di sicurezza.

---

## Nota

Fix suggeriti (pre-warm slug attivi, cache lingue base, timeout Redis, SW opzionale, s-maxage più largo) → oggetto FASE 2. Questo documento è solo diagnosi.
