# Audit — Device-frame di simulazione formato nella pagina pubblica

Consolidamento FASE 1 + FASE 1b. Read-only, nessuna implementazione. Riferimento per la pianificazione FASE 2 (vedi prompt separati `FASE2.1_...md` ecc.).

## Obiettivo della feature

Estendere `?simulate=<data>` con un secondo parametro `preview=<desktop|tablet|mobile>` che mostra la pagina pubblica reale dentro un device-frame, per permettere al ristoratore (che lavora da desktop) di vedere l'esperienza mobile senza scansionare il QR da telefono.

Decisioni prodotto fissate:
- Formati disponibili solo ≤ al dispositivo reale con cui si apre l'admin.
- Riuso del componente `.deviceScreen` già esistente in `StylePreview` (nessun notch/home-indicator).
- Persistenza in URL, condivisibile.
- Scope solo contesto autenticato/admin, mai sulla pagina pubblica reale per i visitatori finali.
- Fix completo: include il comportamento di `PublicSheet` (non solo griglia/header).

---

## FASE 1 — Findings generali

1. **Meccanismo `simulate`** — `PublicCollectionPage.tsx:70,315-334`. Nessun controllo permessi (gap pre-esistente, loggato separatamente in Notion come task ALTA — Privacy e Sicurezza). Stesso gap lato server in `resolve-public-catalog/index.ts:445-462`. Banner div inline-styled, renderizzata in `PublicCatalogReady.tsx:455`.
2. **Device-frame in StylePreview** — `scrollContainerEl`/`viewportWidthEl` puntano allo stesso `.deviceScreen`. Mobile 375×667 fisso, desktop 1280×720 fisso + `transform:scale`.
3. **PublicCollectionHeader** — `readScroll` con fallback pulito `scrollContainerEl ?? window`. Pagina pubblica reale oggi non passa nessuno dei due → usa `window`/fallback lock iOS.
4. **CollectionView** — griglia genuinamente `@container collection`-driven, confermato. Ma 7+ componenti con dipendenza diretta da `window`/`matchMedia` senza hook di override: `PublicSheet.tsx` (il più critico), `SearchOverlay`, `PublicBottomBar`, `LanguageSelectorView`, `CollectionSectionNav`, `StarRating`, `ReviewsView`.
5. **PublicSheet + scroll lock** — conflitto architetturale, non cosmetico (dettaglio in FASE 1b).
6. **Sync header a 3 punti** — non confermato letteralmente nel CLAUDE.md fornito. Trovati 2 punti reali di mapping: `StylePreview.tsx:500-504` (mock) + `PublicCatalogReady.tsx:382-386` (reale). Il device-frame tocca solo quello reale.
7. **Permission gating** — solo `Programming.tsx:1434` costruisce URL `simulate` (gated `scheduling.write`), ma il meccanismo stesso non verifica nulla se l'URL è costruito a mano. Gap pre-esistente, non causato da questa feature.
8. **Breakpoint** — nessuna costante condivisa. `CONTENT_MAX_WIDTH=1280` duplicato in `public-theme.scss:38`, `PublicCollectionHeader.tsx:24`, `StylePreview.tsx:468`. Tech debt noto, fuori scope.

**Verdetto FASE 1**: pattern `StylePreview` non riusabile as-is. `StylePreview` è un sandbox mock chiuso (`interactive={false}`), la pagina pubblica reale ha `PublicSheet` live + body-lock hard-wired a `window`/`document.body`, zero hook di scoping.

---

## FASE 1b — Findings mirati (PublicSheet + .deviceScreen)

1. **`.deviceScreen`** — JSX inline in `StylePreview.tsx:518-605` (rami mobile/desktop duplicati), nessun notch/decorazione, solo frame + div di scroll. CSS in `StylePreview.module.scss:77-119` (dimensioni, radius, bordo, ombra, scrollbar nascosta). Non estratto — da portare in componente presentazionale in `src/components/ui/`, disaccoppiato da `viewMode`/mock coupling di `CollectionView`.
2. **PublicSheet — variant switch** — `useIsMobile()` (`PublicSheet.tsx:19-31`), puro `window.innerWidth`/`matchMedia`, zero hook di override. Anche `vh` state, `y.set(window.innerHeight)` in apertura, calcolo `targetY` in uscita — tutto hardcoded su `window`. Punti di ricalcolo multipli, non un solo posto.
3. **Body-lock** — `useSheetBodyLock.ts`: zero indirection, `document.body`/`window.scrollY` hardcoded ovunque (`releaseBodyLock` righe 29-38, `lockBody` righe 43-60). Il gap più ampio rispetto a header/bottombar (che hanno già vie di fuga). Scroll listener: `useScrollCollapse.ts` window-based + contatore globale a modulo `hasOpenSheet()` (non scopato per container). Il pattern di `PublicCollectionHeader.readScroll` (`scrollContainerEl ?? window`) è già la via di fuga corretta, da replicare.
4. **Invarianti iOS**:
   - WAAPI exit: nessun rischio diretto di scoping, ma la sua ragion d'essere (WebKit reflow-stall) diventa irrilevante in preview (Chrome desktop) — il path resta comunque sicuro.
   - `dragMomentum={false}`: zero coupling a `window`/`document`, nessun rischio.
   - Divieto `backdrop-filter`: gated da `isMobile`, solo desktop. **Rischio**: se `isMobile` viene sovrascritto dalla larghezza simulata, un dialog con `backdrop-filter` potrebbe finire dentro un frame che vuole sembrare mobile.
   - Ordine release-before-exit-animation (`animateOutMobile` riga 245, release come prima istruzione): va preservato alla lettera su qualunque nuovo target di lock — nessun riuso possibile, coupling nuovo di zecca.
5. **Altri componenti window-dependent** — `PublicBottomBar` + `PublicCollectionHeader` hanno già vie di fuga (prop `preview` / `scrollContainerEl`+`viewportWidthEl`). `SearchOverlay`, `CollectionSectionNav`, `StarRating`, `ReviewsView` — chiamate dirette, zero indirection. `LanguageSelectorView.tsx:82` — commento che referenzia il pattern `scrollContainerEl (preview) ?? window`, **ambiguo, da leggere per intero se in scope**.
6. **Scoping centralizzato** — nessun context esistente per "viewport simulato corrente". Precedente più vicino: `PublicPortalContext` (`src/features/public/components/PublicPortalContext.ts`), `createContext<HTMLElement|null>` semplice, scopato sotto `PublicThemeScope`, consumato da `PublicSheet:70`. Un nuovo meccanismo di scoping si incastrerebbe a quel livello, non tra i provider globali (Auth/Tenant/ecc. sono business/workspace, tier sbagliato).
7. **Persistenza URL** — `simulate` letto via `useSearchParams()` in `PublicCollectionPage.tsx:69-70`, validato riga 321 (parse data), guida il refetch via dependency array riga 403. Nessun write-back in questo file — il param è costruito a monte da `Programming.tsx`. `preview` replicherebbe lo stesso pattern read-only, propria validazione, aggiunto allo stesso dependency array.

**Verdetto FASE 1b**: estrazione `.deviceScreen` è meccanica. Scoping header/bottombar è pattern già quasi risolto (riuso `scrollContainerEl`/`viewportWidthEl`). Il lavoro vero è `useSheetBodyLock` (zero indirection oggi) + `useIsMobile` in `PublicSheet` (serve input di override) + i 4 componenti a chiamata diretta senza alcun hook.

---

## Piano FASE 2 (proposto, non ancora implementato)

Split in 4 commit/prompt separati, in quest'ordine:

1. **Fondamenta** — lettura param `preview`, contesto viewport simulato (accanto a `PublicPortalContext`), estrazione `.deviceScreen`, wiring dei consumer già pronti (CollectionView/PublicCollectionHeader/PublicBottomBar). Rischio basso.
2. **PublicSheet** — override `useIsMobile`, scoping `useSheetBodyLock`, fix rischio `backdrop-filter`, preservazione ordine release-before-exit-animation. Rischio alto, richiede test iPhone reale.
3. **Componenti grezzi** — SearchOverlay, CollectionSectionNav, StarRating, ReviewsView + chiarimento `LanguageSelectorView.tsx:82`. Rischio basso, dopo il 2 per seguire lo stesso pattern stabilizzato.
4. **Controllo UI** — pulsante che scrive `preview` in URL, posizionato nella barra info-locale. Ultimo, per poter testare i passaggi precedenti costruendo l'URL a mano.

## FASE 3.3 — Esito

- **Zoom mobile**: verificato NON essere un bug. Misurazione in console dentro l'iframe (`?preview=mobile` su staging): `innerWidth: 375`, `clientWidth: 360` (scrollbar), `htmlFontSize: 16px`, `dpr: 2`, `vvScale: 1`, `max640: true` — tutti i valori attesi. La percezione di "zoom" era l'effetto fisico normale di 375px CSS su un monitor desktop (bassa densità di pixel) vs gli stessi 375px CSS su un iPhone reale (alta densità) — nessuna modifica al codice necessaria.
- **Desktop no-op**: implementato. `NO_FRAME_FORMATS` (`{desktop}`) controllato prima della query di sessione in `PublicCollectionPage.tsx` — `preview=desktop` risolve sempre a `null`, nessun `DeviceFrame`/iframe, path identico a `/:slug` senza `preview`. `DeviceFrame.tsx` invariato (il suo ramo desktop resta vivo per `StylePreview.tsx`, che lo usa autonomamente).

## Nota adiacente

Gap permessi su `?simulate=` (nessun controllo cross-tenant) — loggato in Notion come task separato, priorità ALTA, area Privacy e Sicurezza. Non bloccante per questo lavoro ma da non perdere.
