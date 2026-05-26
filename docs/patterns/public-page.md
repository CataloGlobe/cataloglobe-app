# Pagina pubblica (`/:slug`)

**Flusso dati**:

```
/:slug → PublicCollectionPage
  → Edge Function resolve-public-catalog({ slug, simulate? })
  → { business, tenantLogoUrl, resolved: ResolvedCollections, subscription_inactive? }
  → mapCatalogToSectionGroups(resolved)
  → PublicThemeScope (applica CSS tokens dello stile)
    → CollectionView (componente condiviso con StylePreview)
```

**Simulazione**: `?simulate=<ISO_DATE>` — solo per utenti autenticati. Mostra banner giallo in cima.

**Componenti chiave** (in `src/components/PublicCollectionView/`):

- `CollectionView` — contenitore principale. Il grid card usa `@container collection (...)`, MAI `@media` su viewport. `.container` ha `container-type: inline-size; container-name: collection`. Modifiche al responsive card → SEMPRE `@container collection`.
- `PublicCollectionHeader` — header hero-to-compact via scroll listener (NON IntersectionObserver). Props chiave: `scrollContainerEl`, `viewportWidthEl`, `headerRadius` (numerico in px). `readScroll` legge `body.style.top` come fonte autoritativa quando `body.style.position === "fixed"` (modale aperta) — senza questo, su iOS Safari `window.scrollY` vale 0 durante lock e header torna a hero.
- `PublicFooter` — orari, tariffe (via `PublicFees`), social.
- `PublicFees` / `PublicFeeRows` — tariffe nel footer (solo `fees`, non `payment_methods`/`services`). `PublicFeeRows` riusato in InfoSheet.
- **InfoSheet** (modale "Informazioni" inline in `CollectionView`) — orari, tariffe, metodi pagamento, servizi, contatti, indirizzo. `payment_methods` e `services` renderizzati QUI come chip, NON nel footer.
- `SearchOverlay`, `SelectionSheet`, `ItemDetail`, `ReviewsView`, `FeaturedBlock` (slot wrapper per `before_catalog`/`after_catalog`), `FeaturedCard` (card component con variant `card`/`highlight`), `FeaturedPreviewModal`, `PublicCatalogTree`, `CollectionSectionNav`, `LanguageSelector`, `PublicSheet`.

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

**Hub tabs** (`HubTab = "menu" | "events" | "reviews"`):
- `menu` — catalogo prodotti + featured blocks
- `events` — eventi/promo (da sviluppare)
- `reviews` — recensioni via `submit-review` edge function

**Slot FeaturedBlock** (solo 2, hero rimosso, migration `20260414190000`):
- `before_catalog` — tra header e catalogo, a livello `.frame` (fuori da `.container`)
- `after_catalog` — sotto catalogo, prop `featuredAfterCatalogSlot` su `CollectionView`, a livello `.frame`

**Stati pagina**: `loading | error | inactive | subscription_inactive | empty | ready`

## PublicSheet

Pattern per modali/sheet nella pagina pubblica. **Non usare** SystemDrawer/DrawerLayout nella pagina pubblica.

```
PublicSheet → bottom sheet su mobile (swipe-to-close) | dialog centrato su desktop
```

- Usa `position:fixed` sul body per lock scroll iOS Safari (ripristina esatta posizione al chiudi): salva `window.scrollY` e scrive `body.style.top = -${scrollY}px`. **Effetto collaterale**: su iOS Safari `window.scrollY` torna a 0 durante il lock. Qualsiasi scroll listener su `window` deve leggere il vero scrollY da `-parseInt(body.style.top)` quando `body.style.position === "fixed"`.
- Drag handle su mobile, Escape per chiudere.
- Import: `@components/PublicCollectionView/PublicSheet/PublicSheet`
