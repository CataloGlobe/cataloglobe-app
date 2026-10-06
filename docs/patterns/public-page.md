# Pagina pubblica (`/:slug`)

**Flusso dati**:

```
/:slug → PublicCollectionPage
  → Edge Function resolve-public-catalog({ slug, simulate? })
  → { business, tenantLogoUrl, resolved: ResolvedCollections, public_allergens?, subscription_inactive? }
  → mapCatalogToSectionGroups(resolved)
  → PublicThemeScope (applica CSS tokens dello stile)
    → CollectionView (componente condiviso con StylePreview)
```

**Allergeni nel payload** (`public_allergens`): `resolve-public-catalog` legge la tabella di sistema `allergens` e la mette nel payload, per ogni vertical. Così la portano con sé snapshot Redis, cache localStorage e HTML SSR. **Niente letture separate** degli allergeni nella pagina o nell'SSR: `derivePageState(payload)` li prende solo da lì.
- Chi li mostra: `verticalShowsAllergens` (`src/constants/verticalTypes.ts`), unica regola.
- Campo assente con un vertical che li mostra (lettura fallita lato edge, o snapshot precedente al campo) → `allergensUnavailable`: avviso «Informazioni sugli allergeni momentaneamente non disponibili, chiedi al personale», mai il menù senza allergeni in silenzio. Il payload si serve ma **non va in cache**: `isHealthyPayload` (Redis) e la stessa regola sulla cache localStorage.
- Snapshot vecchi senza campo: si aggiornano alla scadenza o con un revalidate manuale, niente invalidazione automatica.
- **Ordine di deploy**: prima `resolve-public-catalog` (`supabase functions deploy`), poi push/Vercel. Al contrario ogni payload arriva senza `public_allergens`: avviso ovunque sui vertical food e niente in cache finché l'edge non è aggiornata.

**Simulazione**: `?simulate=<ISO_DATE>` — solo per utenti autenticati. Mostra banner giallo in cima.

**Componenti chiave** (in `src/components/PublicCollectionView/`):

- `CollectionView` — contenitore principale. Il grid card usa `@container collection (...)`, MAI `@media` su viewport. `.container` ha `container-type: inline-size; container-name: collection`. Modifiche al responsive card → SEMPRE `@container collection`.
- `PublicCollectionHeader` — header hero-to-compact via scroll listener (NON IntersectionObserver). Props chiave: `scrollContainerEl`, `viewportWidthEl`, `headerRadius` (numerico in px). `readScroll` legge `body.style.top` come fonte autoritativa quando `body.style.position === "fixed"` (modale aperta) — senza questo, su iOS Safari `window.scrollY` vale 0 durante lock e header torna a hero.
- `PublicFooter` — orari, tariffe (via `PublicFees`), social.
- `PublicFees` / `PublicFeeRows` — tariffe nel footer (solo `fees`, non `payment_methods`/`services`). `PublicFeeRows` riusato in InfoSheet.
- **InfoSheet** (modale "Informazioni" inline in `CollectionView`) — orari, tariffe, metodi pagamento, servizi, contatti, indirizzo. `payment_methods` e `services` renderizzati QUI come chip, NON nel footer.
- `SearchOverlay`, `SelectionSheet`, `ItemDetail`, `ReviewsView`, `FeaturedBlock` (carosello per `before_catalog`/`after_catalog`, reso da `CollectionView`; oltre `FEATURED_CAROUSEL_LIMIT` = 4 card chiude con «Vedi tutti»), `FeaturedCard` (variant `card`/`highlight`/`compact`), `EventsView` (elenco + dettaglio della sheet «In evidenza»), `PublicCatalogTree`, `CollectionSectionNav`, `LanguageSelector`, `PublicSheet`.

**Card prodotto** — 4 combinazioni:

| Combinazione    | Wrapper                 | Immagine    | Bottone |
| --------------- | ----------------------- | ----------- | ------- |
| Card · List     | bianco + ombra + radius | sinistra    | filled  |
| Card · Grid     | bianco + ombra + radius | sopra (4:3) | filled  |
| Compatto · List | nessuno (trasparente)   | nessuna     | outline |
| Compatto · Grid | nessuno (trasparente)   | nessuna     | outline |

- **Card** usa `--pub-surface-text`. **Compatto** usa `--pub-bg-text`.
- `ProductRow`/`ProductCompactRow` ricevono `cardLayout: "list" | "grid"`.
- Container padre ha `data-card-layout` + `data-product-style`; selettori CSS condizionali usano questi attributi.
- In Compatto·Grid `border-bottom` agisce come separatore: `row-gap: 0` + `:nth-last-child(-n+N)` rimuove border dall'ultima riga visiva (N = colonne correnti). NON usare `:last-child` per separatori in CSS Grid multi-colonna.

**Hub tabs** (`HubTab = "menu" | "reviews" | "storia"`):
- `menu` — catalogo prodotti + featured blocks
- `reviews` — recensioni via `submit-review` edge function
- `storia` — storie del locale

I contenuti in evidenza non sono una tab: hanno la loro sheet (vedi sotto). Gli eventi futuri sono la fase 2 «Prossimamente».

**Slot FeaturedBlock** (solo 2, hero rimosso, migration `20260414190000`):
- `before_catalog` / `after_catalog` — array `featuredBeforeCatalog` / `featuredAfterCatalog` su `CollectionView`, che rende i caroselli in testa e in coda a `.container`.
- **Sheet «In evidenza»**: una sola, posseduta da `CollectionView`. Nessuna voce in barra né in header. Card del carosello → dettaglio (solo chiusura); «Vedi tutti» → elenco dei contenuti di oggi (prima poi dopo, deduplicati per id) → dettaglio con freccia indietro nell'header. Cambia solo il contenuto, mai `contentKey`; scroll a zero a ogni passaggio. CTA in `footerContent` (`FeaturedCtaFooter`).

**Stati pagina**: `loading | error | inactive | subscription_inactive | empty | ready`

## PublicSheet

Pattern per modali/sheet nella pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica.

```
PublicSheet → bottom sheet su mobile (swipe-to-close) | dialog centrato su desktop
```

- Usa `position:fixed` sul body per lock scroll iOS Safari (ripristina esatta posizione al chiudi): salva `window.scrollY` e scrive `body.style.top = -${scrollY}px`. **Effetto collaterale**: su iOS Safari `window.scrollY` torna a 0 durante il lock. Qualsiasi scroll listener su `window` deve leggere il vero scrollY da `-parseInt(body.style.top)` quando `body.style.position === "fixed"`.
- Drag handle su mobile, Escape per chiudere.
- Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`
